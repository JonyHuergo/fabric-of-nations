# Prosperity Program — peacetime economy and demography

**Status:** P0–P2b accepted; the performance stages (D-137, D-139) accepted as complete on
2026-11-04. P3 (D-141) and P4 (D-142) are implemented for review.\
**Authority:** GDD §17J (binding summary), decisions D-115 to D-124. This document is
the detailed implementation plan: stage scope, dependencies, tests and benchmarks.\
**Goal:** a country that never goes to war and never engages in diplomacy must still be
a rewarding game, because its population and economy are a realistic, legible,
causally driven simulation.

---

## 1. Diagnosis of the current build (2026-11-02)

| Area | Current behaviour | Evidence |
|---|---|---|
| Demography | Fertility and mortality levels come from one world schedule indexed by year; every country has the same rates. | `population/definitions.ts` `interpolateAnchors`; `demography.ts` `ageSpecificFertilityRatePer1000(definitions, year, band)` |
| Social mobility | None. A block fills only jobs of its own profession; no promotion/demotion. | `economy/employment.ts` header; no `promot`/`demot` in `packages/sim` |
| Wages | Fixed constants: `baseWage1900RUSDPerYear / daysInYear`. | `economy/settlement.ts` |
| Enterprise | Only the state builds (E3). Buildings always operate, never expand, contract or close. | `economy/construction.ts`, `production.ts` |
| Catalogue | 8 goods, 12 building types, 5 professions; needs are food and clothing only. | `historical_goods.json`, `historical_buildings.json`, `historical_needs.json` |
| Land/resources | No land constraint; `Region.resourceCapsPerDay` is unread. | `population/types.ts` |
| Technology | 120 technologies, almost all flat +1–5% sector bonuses. | `technology.json` |
| Markets | 20 markets for 67 countries; e.g. Argentina is the customs administration of 19 Latin American states, China of Korea and Siam. | `historical/m11/markets_1900.json` |
| Location | 359 blocks and 548 buildings on 133 coarse regions; the 1,689 provinces carry only political state and a pointer (`simulationRegionId`). | `regions_1900.json`, `provinces/types.ts` |
| Performance | Current 1900 world: **p50 657 ms, p95 1,026 ms per simulated day** (Node 22, Windows desktop, 57 measured days after 5 warm-up, 2026-11-02). Profile: whole-world validation ~19%, finance index rebuild and string-keyed lookups ~12%, `computeBuildingCapacity` ~12%, repeated definition validation ~3%, GC 7.5%. | P1 baseline probe |

The accounting, determinism, fiscal, debt, legal, trade and monetary foundations are
sound and are retained. The program replaces the thin and static layers underneath them.

## 2. Target experience

The player governs conditions; households and firms respond. The economic core is a
**Lewis dual economy with Engel demand**: a land-constrained agrarian sector with
surplus labour; a capitalist sector that reinvests profits where returns are high and
pulls workers into towns; demand that shifts from food to manufactures to services as
incomes rise; and a demographic transition driven by literacy, urbanisation, income,
child survival and health. Each country starts from its own 1900 position and can
diverge from history.

Sources of play (all causal, no gameplay pools — GDD §2):

- **Geography:** land quality, deposits, ports and remoteness differ by province.
- **Bottlenecks:** chains (coal + iron → steel → machinery → mechanised farms and
  factories), transport, skills and housing constrain growth visibly.
- **Trade-offs:** protection vs consumer prices, labour law vs profits, schooling vs
  present taxes, extraction vs depletion, state vs private ownership.
- **Shocks:** harvest variance, famine in poorly connected provinces, investment booms
  and busts, bankruptcies, epidemics, discoveries.
- **Legibility:** province panel, map lenses, causal economic report, history charts and
  historical comparisons.

## 3. Stage map and dependencies

```
P0 design ──► P1 performance foundation ──► P2 provinces + national markets ──► P2b historical money
                                              │
                ┌──────────────┬──────────────┼───────────────┬──────────────┐
                ▼              ▼              ▼               ▼              ▼
          P3 local-currency  P4 demography  P5 land,       P6 goods,      P8 infrastructure
             display                         harvests,      Engel demand,  and market access
                                             resources      housing          │
                                                │             │              │
                                                └──► P7 labour market, wages, mobility
                                                              │
                                                              ▼
                                        P9 companies (C1) ──► P10 private investment (C2)
                                                                    │
                                     ┌──────────────────────────────┼───────────────┐
                                     ▼                              ▼               ▼
                              P11 banks, credit,          P12 state/mixed     P13 stock exchanges,
                                  bonds (C3)                 ownership (C4)      M&A (C5)
                                     └──────────────┬───────────────┘               │
                                                    ▼                               │
                                  P14 story layer (events, report, goals, AI) ◄─────┘
                                                    ▼
                                         P15 hundred-year calibration
```

Every stage: ships on web, iOS and Android through the same code path; has unit,
regression, determinism and conservation tests; updates the benchmark; records decisions;
ends with a completion report. A stage does not start before the previous one's
acceptance criteria pass or the designer accepts an exception (AGENTS.md §7).

## 4. Stage specifications

### P1 — Performance foundation

**Why first:** P2 multiplies population blocks roughly 20× and buildings more; the current
world is already ~660 ms/day.

Scope:
1. **World-scale benchmarks.** `pnpm bench` gains (a) the real 1900 world per-day
   p50/p95/p99 with a per-phase breakdown, and (b) a province-scale synthetic world
   (~8,000 blocks, ~10,000 buildings, ~70 markets) derived deterministically from the
   1900 world by splitting blocks and buildings over provinces.
2. **Hot-path fixes without behaviour change.** Cached, numeric-keyed finance index
   maintained incrementally; definitions validated once per context, not per phase;
   per-day capacity computed once and shared between demand and production; full world
   validation removed from the daily hot path (see 3).
3. **Phase validation and rollback (D-116).** Each phase validates its own
   preconditions (cheap, O(entities touched)). Cheap global invariants (designated-cash
   conservation, population totals, inventory identity) run daily. Full world validation
   runs at month end, on load/save, on actions and in test mode. A failing phase aborts
   the day; the runner restores the last good state (§5) and never publishes a partial day.
4. **Structure-of-arrays population pool.** Age cells of all blocks live in one shared
   `Uint32Array` pool (per-block views keep the existing `maleByAge`/`femaleByAge`
   interface); checkpoints copy the pool with one `set`.

Acceptance: identical world hashes before/after on every existing fixture and on 365
days of the 1900 world; ≥10× faster 1900 world day (Node p95); province-scale synthetic
world measured and reported with a per-phase profile; rollback tests (§5) pass.
Device performance is the designer's to test.

**Status (2026-11-02).** P1 is split:

- **P1a — delivered:** items 1(a), 2 and 3, bit-identical to the previous build.
- **P1b — delivered:** D-125 (aggregated market postings, one cash-capped market
  attempt), D-126 (minimal employment repair after deaths), D-127 (exact
  work-in-progress capitalization) and more bit-identical indexing. The 1900 world day
  is about 3.9× faster than the baseline (Node p50 717 → 183 ms), not the 10× target.
- **Open, moved into P2:** item 1(b) (province-scale world) and item 4 (typed-array
  population pool). The profile is now flat (no function above ~6%), so the remaining
  factor needs structural work — fewer per-day allocations and typed-array storage —
  which is best done while P2 rebuilds the population and building layout anyway.
  Details: `P1_COMPLETION_REPORT.md`.

### P2 — Provinces as the economic unit; national markets

Scope:
1. **Remove `Region`.** `PopBlock.provinceId`, `BuildingInstance.provinceId`,
   `ConstructionProject.provinceId`; province fields `unrest`, `infrastructure`,
   `arableLandHa`, `pastureHa`, `urbanShare`; country territory derived from
   `ProvinceOwnership.ownerPolityId`; occupation only through
   `ProvinceOwnership.controllerPolityId` (the duplicate `Region.controllerCountryId`
   goes). Migration, construction, M10 military movement/occupation, unrest, snapshot,
   lenses and UI move to provinces. `simulationRegionId` is deleted from province data.
2. **Customs territories (D-119).** New entity `CustomsTerritory { id, key, name,
   memberCountryIds, administratorCountryId, provinceIds (derived) }`; `Market` =
   customs territory. Default: each sovereign, dominion and historically
   tariff-autonomous vassal has its own; colonies and protectorates join the overlord's;
   the 1900 unions are explicit (Luxembourg–German Zollverein, Liechtenstein–Austria,
   Monaco–France, San Marino–Italy). Every row of the audit table cites a source. A
   province transfer moves its blocks, buildings and stock lots to the new owner's
   territory in one validated, conserving operation.
3. **Generated trade routes.** From province land borders (shared-border pairs already
   in the bundles) and ports (coastal provinces), aggregated to market pairs with
   distance; replaces the 47 authored routes.
4. **Province data pipeline (D-121).** A build script overlays HYDE 3.3 1900 grids
   (total population, urban population, cropland, pasture) on province geometry and
   distributes each country's authored total and occupation mix across provinces;
   buildings are distributed by employment; generated output is committed with
   provenance and a checksum-gated `--check` mode.
5. **RUSD rebasing (D-122)** — moved to P2b (D-130): money values are re-derived
   historically together with productivity, not converted with one deflator.
6. **Save break (D-120).** World schema bump; older saves listed as incompatible with an
   explanation, never deleted or overwritten.

Acceptance: no `Region`/`SimulationRegion`/`regionIds` in `packages/sim`, `data`,
`sim-worker` or `app`; population, cash, goods conserved through a province transfer
test; every selectable country has its own tariff schedule unless the audit table says
otherwise; the 1900 world initialises for all 66 selectable countries; benchmark at full
province scale reported; province panel and province-level lenses on a phone layout.

**Status (2026-11-02).** Implemented for review (D-131 to D-134; report
`P2_COMPLETION_REPORT.md`). The region layer is gone from the four packages; the 1900
world is 1,687 provinces, 5,687 population blocks, 3,725 buildings and 63 customs
territories with 168 generated routes, built from HYDE shares by
`scripts/p2/build-province-scenario.mjs`; legal transfers conserve people, cash and
goods and move provinces between customs territories; schema 28 rejects older saves;
the province panel and four province lenses are on the phone layout. RUSD rebasing moved
to P2b (D-130). Open: performance (about 1.7 s per simulated day in Node at province
scale; see D-133), and the typed-array population pool, measured and deferred (D-133).

### P2b — Historical money and productivity calibration (D-130)

Every authored monetary value (goods prices, wages, savings, treasuries, budgets,
construction and upkeep costs, operating cash, route capacities, RUSD constants) is
re-derived from a cited 1900 source and converted to 1990 dollars with the Minneapolis Fed
CPI (1900 = 25, 1990 = 392.6; 15.704 RUSD per 1900 dollar). Per-country 1900 wage levels by
profession become authored data. Physical productivity is recalibrated so that value added
matches sourced wages and GDP per head.

Acceptance: every money value traces to a source-table row and its conversion (test); the
1900 world initialises for all selectable countries; a before/after report compares GDP per
head, wage levels, fiscal stocks and flows with their sources.

**Status (2026-11-03).** Implemented for review (D-135, D-136; plan
`docs/P2B_CALIBRATION_PLAN.md`, report `P2B_COMPLETION_REPORT.md`). Source table
`historical/p2b/sources_1900.json` (137 rows), builder `scripts/p2b/build-money-calibration.mjs`
(`--check`), province wage tables, building technique and scenario money coefficients
(schema 29), 1900-world definitions, census occupation mix for the United States, and the
D-040 price rule amended to count opening stock only. **Accepted by the designer on
2026-11-04 (D-139)**, including the implemented price rule and the listed open items.

**Performance stages (D-137, D-139).** Two bit-identical performance stages followed P2b
(`PERF_COMPLETION_REPORT.md`, `PERF_STAGE2_REPORT.md`). Against the D-137 baseline the
host day is 6.6× (mean) / 7.2× (p50) faster, save 4.9×, load 4.4×, the first campaign
15.7×. The 10× target was not fully met; the designer accepted the result as complete on
2026-11-04 and lifted it as a precondition for P3. The open measurements and proposed next
steps stay in `PERF_STAGE2_REPORT.md`.

### P3 — Local-currency display

RUSD stays the simulation unit; the player sees money in the country's currency (D-122).
Scope: source-backed 1900 parities (gold-standard and silver rates) as data;
`CurrencyValuation.rusdPerUnit` initialised from them; snapshot carries the valuations;
one formatting module converts at display time; a currency selector in settings (own
currency default, any registered currency or RUSD selectable). Display conversion never
feeds back into the simulation.

Acceptance: every money label goes through the formatter (audit test); changing the
display currency changes no world hash; a forced devaluation fixture shows local figures
rising while RUSD figures are unchanged.

**Status (2026-11-04).** Implemented for review (D-141; report `P3_COMPLETION_REPORT.md`).
Data `historical/p3/currencies_1900.json` (Director of the Mint, 1 January 1901, and the
same report's 1900 country answers): 52 own currencies and the Maria Theresa thaler, 15
adopted arrangements, paper currencies at their 1900 circulating rate; month-end closing
valuations (schema 30); one formatter `packages/app/src/format/money.ts`; Settings
selector; test `p3-local-currency`. The designer's money requirements (gold and silver as
mined, traded goods; fluctuating currencies; giving up or creating a currency) are
recorded as proposed decision D-140 for P5, P6 and P11.

### P4 — Cause-driven demography

Model (all coefficients in constants with units/status):
- **Age pattern vs level.** WPP age schedules supply the *shape*; the *level* is a
  per-block state derived from causes. Fertility level: female literacy, urban share,
  income relative to subsistence, child mortality (lagged), contraception technology,
  family/health law. Mortality level: food sufficiency (actual calories consumed),
  sanitation and health services (E5), medical technology, urban crowding/housing,
  famine and war effects.
- **Initial levels** per country from 1900 estimates (country TFR and life expectancy;
  sources recorded), so 1900 starts differ by country.
- **Urban/rural split** per province (HYDE urban population), with urban mortality
  penalty until sanitation, lower urban fertility.
- WPP 1950–2000 is a **validation target**, never an input.

Acceptance: per-country 1900 crude birth/death rates within documented tolerance of
sources; in a no-input century run, TFR declines follow literacy/urbanisation (tested
causally with fixtures that vary one cause); famine fixture raises mortality only through
food shortfall; conservation exact; WPP comparison report at 1975/2000 per region.

**Status (2026-11-05).** Implemented for review (D-142; report `P4_COMPLETION_REPORT.md`).
Data `historical/p4/` (Gapminder 1896–1905 extract, province → modern-country crosswalk,
stand-ins, generated levels, stable age structures and urban shares, built by
`scripts/p4/`); schema 31, protocol 20; per-province and per-country rates, pyramid,
causes and yearly history in the province panel and the Population ledger; tests
`p4-demography`. WPP comparison: `docs/P4_WPP_COMPARISON.md`.

**Amendment (2026-11-05, D-144).** The fertility level is now the natural-fertility
saturation of residual × causes: unchanged up to 1.7 (about 8.2 children per woman), then a
tanh approach to 2.3 (about 11.1, the top of the Hutterite range; the designer raised it
from a first-draft 2.2). It answers the P5a century stop of
1 February 1993 (fertility level 4.009); sourced 1900 levels are unchanged. Not yet
re-verified by a century run.

### P5 — Land, agriculture, harvests, resources

- Farm output: land × labour × machinery/fertiliser × technology with diminishing
  returns in labour per hectare; peasants keep their own consumption before selling
  surplus (in-kind consumption recorded explicitly).
- Harvest variance: keyed draw `harvest.weather` per (province, year) — stable purpose,
  no shared stream.
- Deposits: coal, iron, oil, copper, timber stock per province with size and quality;
  hidden deposits revealed by survey work or technology; extraction depletes them.
  Sources: USGS MRDS and authored historical fields (D-121).

Acceptance: marginal product falls with labour per hectare; bad-harvest + low-access
fixture produces shortage, price spike and mortality; deposits never go negative and
depletion is conserved; discovery deterministic under replay.

**Status (2026-11-05).** Split by the designer into **P5a** (land, harvests, own
consumption, deposits and discovery; implemented for review, D-143, report
`P5_COMPLETION_REPORT.md`, schema 32, protocol 21) and **P5b** (the 57-good catalogue of
`docs/P5_GOODS_CATALOGUE_PROPOSAL.md`, its recipes, extraction buildings and 1900
production; brought forward from P6, not started). P6 keeps the linear-expenditure
demand, saving and housing. Data provenance: `docs/P5_LAND_AND_RESOURCES_PROVENANCE.md`.

### P6 — Goods catalogue, Engel demand, housing

- ~22 goods covering food (grain, meat, fish, processed food), fibres, timber, coal,
  iron, oil, steel, machinery, chemicals/fertiliser, construction materials, textiles,
  clothing, furniture/household goods, electricity, motor vehicles, appliances, and
  services (commerce, transport, professional); technology unlocks goods and methods.
- Demand: linear expenditure system across need categories (subsistence quantities plus
  income-elastic marginal shares) with price substitution inside categories; household
  saving rate by class.
- Housing: physical dwelling stock per province, built through construction; crowding
  feeds mortality and unrest.

Acceptance: food expenditure share falls with income (property test); substitution moves
demand toward the cheaper good; housing conserved through construction and depreciation.

### P7 — Labour market, wages, social mobility, urbanisation

- Monthly wage adjustment per (customs territory, profession) with provincial
  differentials from vacancy and unemployment rates; floors from minimum-wage law and
  the peasant alternative income.
- Hiring to the point where revenue covers the wage; layoffs when it does not.
- All nine GDD professions. Monthly mobility flows between blocks of one province,
  carrying age structure, driven by vacancies and wage gaps, gated by literacy and
  training; rural-to-urban migration toward jobs and housing.

Acceptance: in a growing no-input economy the agricultural employment share falls;
unemployment lowers wages; conservation of people through mobility; determinism.

### P8 — Infrastructure and market access

- Railways, roads and ports as province capital stock built with steel, timber,
  construction materials and labour; depreciation and upkeep.
- One national clearing price per market; each province carries a transport wedge on
  net purchases from and sales to the national pool that falls with its infrastructure
  and network distance to the market hub; same-province matches avoid the wedge.

Acceptance: building a railway raises farm-gate prices and commercial output in that
province; the wedge is accounted as real freight cost, not lost value.

### P9–P13 — Companies and capital markets

See `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md` (D-123). Summary: P9 companies own
buildings and keep their own balance sheets; P10 companies invest, expand, contract,
close and go bankrupt; P11 banks, deposits, loans and bonds with an emergent interest
rate; P12 state and mixed ownership, nationalisation and privatisation as player
actions; P13 stock exchanges, share issuance and trading, market capitalisation,
mergers.

### P14 — Story layer

Causal monthly economic report ("what is holding the country back", ranked from data),
event dispatches (harvests, famines, booms, crashes, discoveries, bankruptcies), optional
national goals measured on real statistics, historical comparisons, bounded history
charts, and country AI covering tariffs, investment priorities and the new levers.

### P15 — Hundred-year calibration

No-input and AI-only century runs reported against Maddison GDP per head, urbanisation,
sectoral employment shares, life expectancy and TFR, with documented tolerance bands.
Coefficients change only after diagnosing a structural cause (GDD §6.6).

## 5. Rollback guarantee (P1, D-116)

- A day is either fully published or not at all. Every phase validates its
  preconditions; any thrown error aborts the day.
- The runner keeps a **last good checkpoint** and a **journal of accepted actions**
  since it. On failure it restores the checkpoint, deterministically replays the journal
  to the start of the failed day, and stops with the error; the replayed state is
  hash-checked against the hash recorded at that day's start.
- Checkpoints are taken at month start and before every accepted action, so replay is
  at most one month of days.
- Tests: failure injected in each phase leaves a world whose hash equals the pre-day
  hash; replay equals straight-line run; no subsystem (finance, population, markets,
  trade, monetary, military, provinces) differs after rollback.

## 6. Benchmarks

| Benchmark | Introduced | Reported |
|---|---|---|
| 1900 world day | P1 | p50/p95/p99 ms per day, per-phase ms, allocations/GC share |
| Province-scale world day | P1 (synthetic), P2 (real) | same |
| Month-end day | P1 | close, wealth, employment, migration, investment costs |
| Checkpoint and rollback | P1 | checkpoint ms, replay ms per day |
| Snapshot build | P2 | worker snapshot ms and bytes |
| Each new subsystem | its stage | phase ms at full scale |
| No-input century | P15 | total wall time, peak heap |

Node numbers are diagnostics. On-device performance is measured by the designer.

## 7. Risks

- **Scale.** ~8,000 blocks and ~10,000+ buildings daily. Mitigation: P1 first; monthly
  cadence for slow systems; typed-array pools; benchmarks gate each stage.
- **Data quality.** HYDE is gridded estimation; deposits are partial. Mitigation:
  provenance, confidence fields, and "provisional" labels in UI.
- **Calibration scope.** Many interacting coefficients. Mitigation: cause-isolating
  fixtures per stage; P15 central calibration.
- **Future polities.** Provinces transferred to a registry polity with no simulation
  country cannot host population. Until a country-instantiation stage exists, transfers
  to non-instantiated polities are rejected.
