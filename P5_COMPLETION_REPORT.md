# P5a completion report — land, harvests, own consumption, resources

**Branch:** `prosperity/p5-land` (from `main` at 4c75a52); not committed. **Decision:** D-143.
**Schema** 32, **worker protocol** 21, **map bridge protocol** 3. Data version unchanged
(`m3-economy-v12`); three technologies added as content.

The designer split P5 into **P5a** (this report) and **P5b**, the 57-good catalogue of
`docs/P5_GOODS_CATALOGUE_PROPOSAL.md` (approved with tin, gold, silver and the
electronics and refined-fuels splits). **P5b is not started**; see §8.

## 1. Scope delivered

| Spec item | Delivered |
|---|---|
| Farm output: land × labour × machinery/fertiliser × technology, diminishing returns in labour per hectare | Output of a land-using building = P2b output × staffing^0.6 × (hectares per level ÷ 1,000)^0.4 × harvest weather × technology. A province's HYDE cropland (pasture for ranches) is shared by the levels of its farms. Machinery is the existing mechanised-farm recipe; fertiliser acts through the existing technology factors (no machinery or fertiliser goods before P5b). World creation folds each farm's 1900 land factor into its technique, so day-0 output is the P2b calibration. |
| Own consumption, recorded in kind, reaching food sufficiency | Households that own a farm, ranch or fishery keep its subsistence food before the market (`planOwnConsumption`). Production diverts the quantity from the owner's lot (`outputs[].ownConsumption`), demand is reduced by it, the calories count in P4 food sufficiency, and its value at opening prices is a wage in kind to the owner (`paidInKindRUSD`). No money moves. |
| Harvest variance `harvest.weather` per (province, year) | Lognormal factor, mean 1, σ 0.15, from two keyed draws on 1 January of the year; a pure function, nothing stored. |
| Deposits with size and quality; discovery; depletion | `World.resources`: 3,834 deposits in the 1900 world (coal, oil, gas, iron, copper, bauxite, tin, gold, silver, nitrate, uranium, timber). Hidden deposits need one of three new prospecting technologies, then a keyed monthly draw `resource.discovery` (hazard 1/120 × infrastructure). `extractFromDeposit` is the only depletion path. Extraction buildings come with P5b's goods. |
| Sources: USGS MRDS and authored fields, validated data, `--check` generator | `scripts/p5/` (provenance: `docs/P5_LAND_AND_RESOURCES_PROVENANCE.md`) |
| Day-6,320 failure | Cause found, reproduced and fixed (§7.1) |
| Phone UI | Province panel: harvest, farm food kept at home, known deposits. Harvest map lens. |

Also fixed along the way: a trade-funding rounding overdraft found by the P5 five-year run
(§7.2). Saves shrank: only the latest month keeps the account-level trial balance (§6).
The snapshot shrank: province ownership is sent as columns.

## 2. Files

**Simulation (`packages/sim/src`)**
- New:
  - `economy/agriculture.ts`: land shares, land factor, weather, technique normalisation, own-consumption plan.
  - `economy/resourceState.ts`: deposit state, validation, column codec.
  - `economy/resources.ts`: discovery and extraction.
- Changed:
  - `economy/production.ts`: capacity with land, labour and weather; kept food diverted from lots; overflow dust fix.
  - `economy/day.ts`: plan, demand, calories, discovery phase, result fields.
  - `economy/settlement.ts`: wage in kind.
  - `economy/trade.ts`: `shipmentFunding`.
  - `economy/period.ts`, `constants.ts`, `accounts.ts`: closing balances, one detailed month.
  - `economy/state.ts`, `construction.ts`, `definitions.ts`, `types.ts`, `validation.ts`, `index.ts`.
  - `world.ts`, `serialization.ts`, `population/state.ts`, `constants.ts` (schema 32).

**Worker and app**
- Worker:
  - New `sim-worker/src/landSnapshot.ts`.
  - Changed `protocol.ts` (21: ownership columns, harvest column, province land), `snapshot.ts`, `demographySnapshot.ts`.
- App:
  - `screens/GameShell.tsx` (land rows).
  - `map/mapModes.ts`, `map/lenses.ts`, `map/bridge/protocol.ts`, `map/host/mapHostState.ts`, `map/runtime/main.ts` (Harvest lens).
  - `components/WorldMap.tsx`, `screens/dispatches.ts` (ownership rows).
  - `storage/saveStorage.ts` (schema 32).
- Regenerated: worker scenario and bundle, map atlas (`public/map/atlas-v1.html`).

**Data and generators**
- `scripts/p5/build-p5-world.mjs` (`--check`): land, imputation, building land use, deposits, survey countries.
- `scripts/p5/extract-mrds.mjs`, `extract-forest-1900.mjs`: source extracts from git-ignored caches.
- `scripts/p5/before-after.mjs`, `playtest-land.mjs`.
- `packages/data/data/historical/p5/`: authored deposits, MRDS and forest extracts, generated provinces, definitions, deposits, countries and build report.
- Content and wiring:
  - `technology.json`: 3 technologies.
  - `scripts/p2/build-province-scenario.mjs`: P5 file map.
  - `packages/data/src/historical.ts`: deposits loader.
  - `.gitignore`: `.cache-p5/`.

**Tests**
- New: `p5-land.test.ts` (22 tests), `fixtures/p5Encoding.ts`.
- Restated or re-pinned (§4): `batch5-validation`, `batch6-integration`, `determinism`, `e2-fiscal-management`, `m2-calibration`, `m3a-serialization`, `m4b-save-compaction`, `m5-feasibility`, `m6-ai`, `m14-rusd`, `p2b-money`, `p3-local-currency`, `m15-map-style`, `m16-mobile-shell`, `m7-supervisor`, `menu-save-preview`, `m12e-oceania-provinces`.
- `fixtures/p4Encoding.ts` also strips the P5 fields.

**Docs**
- `DECISIONS.md` (D-143), `docs/PROSPERITY_PROGRAM.md`, `Fabric_of_Nations_GDD.md` (§17J status line).
- `docs/P5_GOODS_CATALOGUE_PROPOSAL.md`, `docs/P5_LAND_AND_RESOURCES_PROVENANCE.md`, `docs/P5_BEFORE_AFTER.md`.
- Run data: `docs/p5/`, `docs/p4/century-run.json`, `docs/P4_WPP_COMPARISON.md`.
- Screenshots: `docs/images/p5/`.

## 3. Behaviour and design decisions

All are in D-143; the main points:
- **Land never changes day-0 output.** It matters when farms are built or lost: a new level
  in a province shares its land, so output per level falls.
- **No land, no farm.** A farm in a province without land of its kind cannot produce;
  world creation and construction reject it. Twelve 1900 provinces needed imputed land.
- **Own consumption is in kind.** No cash moves. Its value at opening prices is a wage in
  kind up to the owner's cash wage at that farm; the rest is the owner's draw. The money
  circuit is unchanged at today's prices, and only the physical food is guaranteed.
- **Discovery.** It is scaled by infrastructure, standing for prospectors' access. Sixteen
  countries with a national geological survey by 1900 start knowing geological surveying.
- **Hidden deposits are never sent to the UI.**
- **Snapshot.** Province ownership is sent as columns (−214k characters), which made room
  for the harvest column.

## 4. Commands and results

| Command | Result |
|---|---|
| `pnpm test` | **1,397 / 1,397 pass.** Last full run: 1,396 pass and the worker-bundle drift suite failed only because I edited two worker files after bundling. Rebuilt; that suite then passed 2/2. |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass (327 TypeScript files, 79 in `packages/sim`) |
| `node scripts/p5/build-p5-world.mjs --check`, `p2/build-province-scenario.mjs --check`, `p2b/build-money-calibration.mjs --check`, `p4/build-demography-1900.mjs --check`, `p4/build-province-crosswalk.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build:check`, `pnpm -F @century/app build:worker:check`, `pnpm map:atlas:check` | current |
| `pnpm audit:monetary`, `pnpm audit:branding`, `node scripts/m11e/check-sim-dependencies.mjs` | pass; 0 import cycles (79 modules) |
| `pnpm -F @century/app export:web`, then `node scripts/p5/playtest-land.mjs` | **14/14** at 844×390 (harvest row, farm food kept, deposits, Harvest lens and legend, controls ≥ 44 pt, no console errors) |
| `node scripts/perf/playtest-stage.mjs` | **13/13** |
| `node scripts/p4/playtest-demography.mjs` | **25/25** |

**P5 acceptance tests (`p5-land`)**
- Marginal product falls as labour per hectare rises (property test over 21 staffing levels; doubling labour gives exactly 2^0.6).
- Bad harvest in a low-access market (seed with a 0.685 harvest, compared with the same seed at a neutral harvest):
  - shortage;
  - grain price at the 4× cap against the floor;
  - more deaths;
  - every block's other causes identical, and the mortality ratio equal to the food term.
- Deposits never negative, depletion conserved, impossible states rejected, save round-trip.
- Discovery identical under replay and across save/load, seed-dependent, gated by technology, monthly only.
- Own consumption: kept + marketed = produced; at most the subsistence need; no money moves.
- Weather: known answer, mean 1 and σ over 4,000 provinces.
- 1900 technique normalisation exact; construction rejects a farm without land.
- 1900 deposits as sourced; generators current.
- Overflow dust regressions; trade-funding regression.

**Re-pinned digests and their reasons**
- `determinism` (empty world), `m3a-serialization`, `m2-calibration` (two digests): encoding only. `prePhase5Digest` removes `World.resources` and the closing balances, sets schema 31, and reproduces the P4 digests exactly. Those assertions remain in the tests.
- `m14` 1900 world: by design — land normalisation, deposits, survey countries, technologies.
- `batch5` 22-tick M5 sample: by design — own consumption and wage in kind.

**Restated tests (please review; details in D-143)**
- `m5-feasibility`: the supply criterion is now 99 % (was 99.5 %). The M5 sample's capacity equals demand in two markets, and owners now eat first, so buyers get 99.28 %; food sufficiency is unchanged.
- `batch5-validation`: `fallbackTicks > 0` is reported, no longer required. Since D-125 it adds no validation; the validation count is still asserted.
- `e2-fiscal-management`, `m6-ai`, `m4b-save-compaction`: restated for the one-month detailed window. Their strength is unchanged.
- `p2b-money`, `batch6-integration`: an owner's wage is now cash plus in kind.
- `m16-mobile-shell`, `m15-map-style`, `m7-supervisor`, `menu-save-preview`, `m12e`: updated to the new snapshot shape and the Harvest lens. The lens-policy test now requires the snapshot to carry `harvestFactor` instead of forbidding a harvest lens.

## 5. Benchmark (Node diagnostic; device performance not evaluated)

Node 24.22.1, Windows x64, AMD Ryzen 5 2600. `main` (4c75a52) was built in a separate
worktree and measured back to back with the branch on an idle machine, using
`node packages/bench/dist/perfPhases.js` and `node packages/bench/dist/perfBench.js 92`.
The worktree is removed after this run.

| Item | P4 report | `main` today | **P5 today** |
|---|---:|---:|---:|
| Host day mean / p50 (ms) | 351 / 299 | 348 / 298 | **362 / 305** |
| Tick mean / p50 | 303 / 255 | 301 / 254 | **311 / 260** |
| Snapshot build mean / p50 | 41.4 / 38.5 | 41.1 / 38.5 | **44.7 / 42.8** |
| Market phases (household demand + production demand + clearing, mean) | — | 74.4 | **90.6** |
| Demography / needs (mean) | 30.9 / 23.1 | 30.9 / 24.3 | **33.4 / 25.5** |
| Resources (discovery, mean; month starts 1.7) | — | — | **0.08** |
| Ordinary day (perfPhases, days 2–11) | 284.1 | 289.2 | **281.1** |
| Month starts ÷ ordinary p50 | 2.61–3.45× | 2.62–3.27× | **2.72–3.35×** |
| Save / load (ms) | 942 / 1,002 | 944 / 1,012 | **922 / 961** |
| Stored save at day 92 (chars) | 5.22 M | 5.22 M | **4.28 M** |
| First CREATE_GAME (fresh host) | 74.4 | 77.2 | **75.0** |
| Host throughput at 30 days/s | 3.15 | 3.17 | **3.07** days/s |
| Snapshot JSON p50 | 0.73 M | 0.73 M | **0.53 M** |

Determinism (two runs), staged = phase mode and the save round-trip hash: **PASS**.

**What P5 costs.**
- **Host day:** about +14 ms mean (+4 %) and +7 ms p50 (+2 %).
- **Market phases:** about +16 ms.
  - The day-level capacity lookups are now built before household demand: that phase went from 10.4 to 23.2 ms, while production demand went from 6.7 to 3.3 ms.
  - The own-consumption plan, the demand reduction and the diversion in production add the rest.
- **Snapshot build:** about +4 ms (the harvest column and the ownership table).
- **Focused province:** its land section adds about 4 ms more per snapshot.
- **Not worse:** the perfPhases ordinary day is within its run-to-run noise (281 against 289 ms). Save, load and stored size improved.

## 6. Saves

Stored characters, 1900 world, same seed, `compressSaveForStorage`:

| Day | `main` | P5 | Change |
|---|---:|---:|---:|
| 3 | 2.87 M | 3.00 M | +4 % (the deposits, saved as columns) |
| 92 | 5.22 M | 4.28 M | −18 % |
| 366 | 11.03 M | 4.67 M | −58 % |

**The small fix (approved with the pre-build report).**
- Only the latest monthly summary keeps its account trial balance.
- Every close records each country's treasury, debt and household cash, and compaction keeps them, so the Ledger history is unchanged.
- Deposits are saved as columns. The first encoding put the day-3 save higher, and the browser showed the quota error from the first days.

**The web save still fails, on `main` as well.**
- The save library writes a staging copy and the primary, and keeps the previous save. Even the 2.9 M day-3 save therefore needs more than Chrome's ~5.24 M localStorage quota.
- The browser checks show the banner on 4–5 January 1900.
- A storage-backend change was not started (your instruction). This is the next step for web saves; Android's AsyncStorage has a similar total limit.

## 7. Bugs found and fixed

### 7.1 Day-6,320 settlement failure (P4 century run)

**Cause.**
- Storage overflow cut every lot in proportion each day, so a lot that never sold shrank geometrically.
- A probe of `main` replayed the run to the same day and the same message. On the morning of day 6,320 there were 1,009 grain lots below 1e-9 kg, 280 of them subnormal (as small as 1.5e-323 kg).
- With a price of 0.1 RUSD/kg, price × quantity rounds to 0, which settlement correctly rejects.

**Fix.** A lot that the cut would leave below the quantity tolerance is lost whole and recorded as overflow loss; the inventory identity still holds. Tests: two regressions, including 6,400 days of overflow.

### 7.2 Trade-funding overdraft (found by the P5 five-year run, day 460)

**Cause.** Trade dispatch let an owner commit 6,248.601058167046 RUSD against a balance of 6,248.601058167045. The day's postings are one journal batch that sums each account's lines, while dispatch tracked cash as a sequence of differences.

**Fix.** `shipmentFunding` keeps a 16-ulp margin on both accounts (below 1e-10 RUSD at 1900 scale), and the owner's injection covers the cost plus the margin. This bug predates P5; P5's different trajectory exposed it. Test: 2,000 sequences of 12 shipments posted batch-style never overdraw.

## 8. Own consumption: before and after, the century, and what remains

The first five years, no input, same seed (full tables: `docs/P5_BEFORE_AFTER.md`):

| 1 Jan | Food eaten main → P5 | CDR main → P5 | Population main → P5 (M) |
|---|---|---|---|
| 1901 | 45.9 % → 63.6 % | 68.3 → 56.6 | 1,545.9 → 1,567.5 |
| 1903 | 40.6 % → 59.2 % | 52.8 → 46.8 | 1,456.4 → 1,519.1 |
| 1905 | 39.9 % → 57.9 % | 48.1 → 44.3 | 1,405.1 → 1,493.3 |

By region in 1905, food eaten main → P5:
- Asia 28.7 % → 56.2 %
- Africa 26.9 % → 59.7 %
- Latin America 36.6 % → 58.3 %
- Europe 58.9 % → 60.1 %
- Northern America 54.0 % → 58.0 %

**How much of the collapse own consumption removes.**
- About half of the food gap.
- Half of the population loss: five years lose 91 M people instead of 179 M.
- Most of the excess in Asia and Africa, where farm households are most of the people.

**What remains, plainly.**
- Everyone without a farm still eats only what wages buy, and the 1900 world has jobs for few of them: 192 M peasant jobs and 26 M labourer jobs for 1.6 billion people.
- Wages are fixed (P7), and there is no private investment (P10).
- Mines, industry and services, which would employ labourers, clerks and capitalists, arrive with P5b.
- Europe and Northern America barely change.
- The world still eats about 58 % of its requirement and loses population.

**Century run.** Command: `node packages/bench/dist/p4Demography.js run 36524 --out
docs/p4/century-run.json`, then `node scripts/p4/wpp-comparison.mjs`
(`docs/P4_WPP_COMPARISON.md`).

**How far it got.**
- It passed P4's stop in 1917 and stopped on simulated day **34,058 (1 February 1993)**, after about 4.0 hours of computing.
- The P4 validator rejected a block's derived fertility level of 4.009 (range 0..4).
- The 1975 comparison with WPP now exists; 2000 does not.

| 1 Jan | Pop. (M) | CBR | CDR | TFR | e0 | Women literate | Food eaten |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1900 | 1,584 | 41.2 | 30.4 | 5.52 | 32.9 | 29 % | 100 % |
| 1920 | 1,426 | 38.5 | 42.7 | 4.34 | 21.2 | 37 % | 61.8 % |
| 1950 | 1,429 | 38.8 | 35.6 | 5.13 | 28.4 | 47 % | 78.8 % |
| 1975 (WPP) | 1,749 (4,071) | 44.6 (29.7) | 35.2 (11.7) | 6.05 (4.08) | 29.3 (58.3) | 22 % | 79.9 % |
| 1993 | 2,141 | 48.0 | 39.0 | 6.36 | 26.4 | 7 % | 69.5 % |

**Reading the century.**
- **Survival.** Farm households survive and grow; the world bottoms out near 1,400 M in the 1930s and grows again.
- **Towns and literacy collapse.** Households without farms keep starving: by 1993 the urban share is 2.4 % and women's literacy 7 %.
- **Fertility rises with that collapse, through P4's causes.** Low literacy, few towns and high child mortality raise fertility. One block's causal fertility level passed P4's validated bound of 4 (a TFR near 19 for that block). That is a P4 modelling question for you: a bound, a saturating response, or nothing until the economy keeps towns alive. I did not clamp it.
- **Comparison with WPP.** The run is no basis for one: the 1975 world has 1.75 billion people against 4.07, and a life expectancy of 29 against 58. The gap is economic: wages (P7), investment (P10), and jobs in mines, industry and services (P5b).

**Addendum (2026-11-05): the 1993 stop is addressed by D-144.**
- The designer chose a saturating response: the fertility level is now the natural-fertility saturation of the causal product, unchanged up to 1.7 (about 8.2 children per woman) and approaching 2.3 (about 11.1, the top of the Hutterite range) above it. The designer raised the cap from a first-draft 2.2 (about 10.6).
- The 1993 block's raw 4.009 would now give 2.2995; the bound of 4 stays as the validation limit and is no longer reachable through causes.
- Sourced 1900 levels (all ≤ 1.667) are unchanged.
- Not yet re-verified by a century run (the designer reruns it after P10).

## 9. Assumptions, provisional values, limitations

- **Provisional coefficients.** All are in `economy/constants.ts`: factor shares 0.6/0.4, reference 1,000 ha per level, weather σ 0.15, discovery hazard 1/120. The deposit class stocks are in `scripts/p5/build-p5-world.mjs`.
- **Weather.** It is independent per province, so a national market averages it out; a correlated regional component is a possible later addition.
- **Imputed land.** Guam, Pohnpei and Monaco have no HYDE land area, so their imputed cropland is unbounded (Guam 210k ha against a real area of about 54k ha).
- **MRDS coverage.** It is about 85 % US records; outside the US the authored giants and the size classes carry the weight.
- **SAGE potential vegetation.** No licence is stated (© University of Wisconsin). It is used with attribution; **please confirm before release.**
- **USGS downloads.** The USGS website refused automated downloads of its historical price and production series (HTTP 403). This matters for P5b prices.
- **Bundle size.** The worker scenario grew 0.5 MB (5.33 → 5.84 MB) and the app worker bundle by about 430 KiB (deposits).
- **Device behaviour** was not tested; device testing is yours.

## 10. P5b — not started

P5b brings the 57-good catalogue forward from P6:
- recipes and extraction buildings that call `extractFromDeposit`;
- 1900 production of the goods that existed then, placed by sourced country output and calibrated by value added (the P2b method);
- prices: 1900 US wholesale × 15.704, or 1990 US prices for later goods;
- technology-gated need items;
- market goods detail in the snapshot only for the player's and the focused market;
- grouped market screens.

It is a calibration of the size of P2b. Its price and production sources must mostly be authored and cited, because USGS blocks automated access to its historical series.

## 11. Open items for the designer

1. The restated tests in §4.
2. The SAGE licence.
3. The web save quota: a storage-backend change.
4. Carried over from P4: the restated `m5-feasibility` and `m2-calibration` tests, and the Mitchell crude-death-rate table.
5. Whether armaments replace the money-only military equipment, and whether pharmaceuticals feed public health, in P5b.
6. The P4 fertility-level bound that stopped the century run in 1993 (§8).
7. Commit: nothing is committed yet.
