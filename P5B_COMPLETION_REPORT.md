# P5b completion report — the goods catalogue (58 goods) and D-140

**Branch:** `prosperity/p5-land` (local commits only; nothing pushed).
**Decisions:** D-146 (designer decisions), D-147 (simulation mechanics), D-148 (1900
placement, data version v13), D-149 (D-140: metal standards and the mint window),
D-150 (currency actions), D-151 (protocol 22 and the phone screens), D-152 (demand for
gold and silver: jewellery in P5b, monetary demand to P11). The additions of 2026-11-08
(hydro, transcriptions, jewellery) are recorded in D-148 and D-152 and summarised in §7.
**Versions:** world schema 33, simulation 0.29.0, data `m3-economy-v13`, worker protocol
22, map bridge protocol 3.
**Status:** implemented for the designer's review, with the open items of §6 and §7. The
performance step (plan §5, §12 step 5) was held at the designer's request on 2026-11-07
and is not done; no benchmark was run in this session (skipped at the designer's request).

## 1. Commits

| Commit | Content |
|---|---|
| `2934b8e` | D-146 decisions and stage acceptances |
| `e0e1de9` | P4 test revisions for the accepted fertility ceiling |
| `7047674`, `537e7a5`, `508cf0b` | DS-140 extract; P5b source rows (1900 prices, output shares, 1901 budget, technology evidence); P5a deposit corrections and two technologies |
| `4aa0f07` | Simulation mechanics: extraction, goods that cannot be stored, optional and maintenance inputs, need gating, schema 33 (D-147) |
| `d1c3f0e` | Catalogue generator stage A: 57 goods, 70 building definitions, need items |
| `d3f1e0f` | Stage B: placement and calibration of the 1900 world, data v13 (D-148) |
| `eb3d0f2` | D-140: metal standards, mint window, 1900 money stocks, gold and silver mines (D-149) |
| `c87a5e0` | Adopting and establishing a currency (D-150) |
| `da0fdba` | 1990 reference prices of later goods (Statistical Abstract 1992) |
| `0c00cd0` | Protocol 22 and the goods screens on the phone (D-151) |

## 2. Files created or modified

**Created**
- Simulation: `packages/sim/src/economy/mint.ts` (mint window, standing offers),
  `packages/sim/src/economy/currencyActions.ts` (adopt, establish, demonetisation).
- Generator: `scripts/p5b/catalogue.mjs`, `build-goods-1900.mjs` (`--check`),
  `placement.mjs`, `extract-ds140.mjs`, `xlsx-lite.mjs`, `playtest-goods.mjs`.
- Data (`packages/data/data/historical/p5b/`, generated except `sources_1900.json` and
  `ds140_1900_1990.json`): goods, building definitions, needs, buildings, markets,
  countries, provinces, trade routes, monetary authorities, calibration trace, build report.
- App: `packages/app/src/format/goods.ts`, `packages/app/src/screens/CurrencyChange.tsx`.
- Tests: `economy/goods-catalogue.test.ts`, `money/metal-standard.test.ts`,
  `fixtures/p5bEncoding.ts`.
- Documents: `docs/P5B_BEFORE_AFTER.md` and `docs/P5B_GOODS_PROVENANCE.md` (both
  generated), `docs/images/p5b/` (playtest screenshots and evidence).

**Modified (main ones)**
- Simulation: `economy/types.ts`, `definitions.ts`, `production.ts`, `market.ts`, `day.ts`,
  `monetary.ts`, `monetaryState.ts`, `state.ts`, `accounts.ts`, `accounting.ts`,
  `agriculture.ts`, `trade.ts`, `construction.ts`, `resources.ts`, `validation.ts`,
  `constants.ts`, `ai.ts`, `serialization.ts`, `index.ts`; `src/constants.ts`.
- Data loader: `packages/data/src/historical.ts` (international opening prices, the
  monetary file), `version.ts`.
- Worker: `protocol.ts`, `snapshot.ts`, `host.ts`, `actionHistory.ts`, `monetaryPreview.ts`.
- App: Markets, Country, Construction and Money screens, `components/ui.tsx`
  (`Disclosure.onToggle`), `worker/SimulationProvider.tsx`.
- Scenario wiring: `scripts/p2/build-province-scenario.mjs`; data version in every scenario,
  `technology.json`, `politics.json`; `scripts/m14/monetary-terminology-audit.mjs`
  (protocol 22); `packages/bench/src/m7Bench.ts` (stored-save fix), `p3Equivalence.ts`.
- `DECISIONS.md` (D-148 to D-151 and the generated index).

## 3. Behaviour implemented

1. **Catalogue (D-146, D-147).** 57 goods in eight groups; 70 building definitions;
   extraction buildings tied to deposits through `extractFromDeposit`; electricity and
   services cannot be stored or traded and are sold the same day (production waves);
   fertiliser and minor materials as optional inputs; maintenance goods bought with half
   the money upkeep; need items gated by technology or local stock; the E4 sectors gain
   mining, energy and services.
2. **1900 world (D-148).** Placement from modelled demand with sourced country shares,
   iterated to a fixed point; the P2b producers rescaled to their market's new demand;
   cotton on its own farms; the workforce cap; the plan §8 residual cap; opening stock
   including merchant stock for imported goods; per-good warehouse capacity; fiscal values
   and route capacities from the new coverage; the A9 technology grants. 6,434 buildings
   (2.0x P2b). Dairy, produce, sugar and coffee-tea-cocoa take their household demand from
   the 1901 food-article weights (Commissioner of Labor 1903, p. 651).
3. **D-140 (D-149, D-150).** Gold, silver and paper standards; 23 metal-standard
   authorities from the Director of the Mint's stocks of 1 January 1901; the mint window
   (purchases below the buy point, sales to the market's bullion dealer above the export
   point, suspension and resumption); valuation = fine content x the metal's price in the
   issuer's market; mint cash funded by the treasury ("treasury, capped": one year of own
   metal output, at most 25 % of the P5 treasury); gold and silver mines sized by the
   mints' purchases; `adopt-currency` and `establish-currency` player actions.
4. **Phone (D-151).** Protocol 22 (sparse, compact market prices; `SET_MARKET_FOCUS`);
   grouped and searchable Markets, production and construction lists; the Money screen's
   metal standard and currency controls.

Simulation fixes found by the 1900 world (D-148 item 10, with regression tests): the farm
household's kept-food plan with optional inputs; non-storable lots cleared whole at day
end; a recipe input within float tolerance of its reservation; the in-transit shipment cap
(512 → 4,096); and, in D-149, the last mint purchase's rounding.

## 4. Commands executed and results

| Command | Result |
|---|---|
| `pnpm test` (final run, after all commits) | see §4.1 |
| `pnpm typecheck` (final run) | see §4.1 |
| `node scripts/p5b/build-goods-1900.mjs --check`, `node scripts/p2/build-province-scenario.mjs --check`, `node scripts/p2b/build-money-calibration.mjs --check`, `node scripts/p5/build-p5-world.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build:check`, `pnpm -F @century/app build:worker:check` | current |
| `node scripts/docs/decisions-index.mjs --check` | current (151 decisions) |
| `node scripts/m14/monetary-terminology-audit.mjs` | passed |
| `pnpm -F @century/app export:web` then `node scripts/p5b/playtest-goods.mjs` | 18/18 checks passed at 844 x 390, no console errors, exceptions or failed loads |
| `pnpm app:export` | web, iOS and Android bundles exported (`dist-web`, `dist-ios`, `dist-android`) |
| `pnpm bench` | passed on 2026-11-07 before commit `d3f1e0f` (after fixing the M7 bench's stored-save check, which had stopped `pnpm bench` since D-137). Not run after D-149: benchmarks were held at the designer's request. |

### 4.1 Final test and typecheck run

`pnpm test` on 2026-11-07 after commit `0c00cd0`: **101 of 101 suites, 1,424 of 1,424
tests passed.** `pnpm typecheck` (libraries built, every package): **0 errors.** The
700,000-character snapshot bound, which failed after stage B, passes with protocol 22.

## 5. Measurements (Node diagnostics; no device result is claimed)

- **Coverage** (`docs/P5B_BEFORE_AFTER.md`): covered value added 482 → 605 bn RUSD,
  46.5 % → 58.4 % of world GDP (United States 40 → 54 %, United Kingdom 27 → 34 %,
  Germany 51 → 68 %). The plan's estimate of 75–90 % is not reached.
- **Modelled ÷ sourced 1900 output:** coal 0.89, sugar 0.84, crude oil 0.72, tin 0.48,
  copper ore 0.42, bauxite 0.41, steel 0.34, gold 0.27, nitrates 0.25, iron ore 0.21,
  silver 0.005, aluminium 0.00.
- **Ordinary day** (perfPhases, days 2–9, Node 24, Windows, Ryzen 5 2600): 593 ms against
  the 450 ms budget (P5a baseline 301 ms; market clearing 133 ms, settlement 137 ms). Not
  optimised (designer's hold).
- **Snapshot:** about 490,000 characters at day 2 for Germany, Britain, the United States
  and Russia; about 494,000 with the US market focused (bound 700,000).
- **92-day run of the 1900 world:** no failure; every metal currency stays convertible over
  60 days with its gold or silver price at the gold point.

## 6. Assumptions, deviations, limitations and open items

**Deviations and assumptions (recorded in D-148 to D-151)**
- Plan §8.5 read as: the P2b need quantities of grain, meat and fish are kept; their
  producers follow modelled demand like every other good.
- Gas lighting is town gas from coal; the four new food groups take 80.4 % of the comfort
  and luxury processed-food value (1901 weights).
- Kerosene, copper and machinery are placed at the shares of crude oil, copper ore and
  steel; goods without sourced shares (coffee-tea-cocoa, rubber, timber) are pooled
  worldwide by province weight where a market cannot make them.
- Minor materials are optional inputs (elasticity 0.05).
- Mint sales go to the market's largest storage building (the bullion dealer); adoption
  sells the closed mint's metal over time (a treasury cannot hold goods); paper currencies,
  aggregates and dependencies of the Mint table are not activated; the mint-cash cap uses
  the P5 treasury.
- The Country screen shows extraction since 1900 (no month-level extraction state).

**Known limitations (measured, for the designer)**
- Machinery (41 markets), construction materials (16) and fertiliser (63) reach the
  price ceiling in a 92-day run: per-route capacity and freight funding hold back imports;
  every farm bids for fertiliser that only gate markets make.
- The plan §8 residual cap leaves Japanese, Spanish and Portuguese households short of
  services; 18 small territories exceed 100 % of GDP.
- A mint without cash (most countries without own metal output) cannot defend its currency
  against an inflow of metal (asset-swap choice of §13.8; free coinage by issue is the
  alternative).
- Four currencies revalue once on day 1 to their metal value (Austria-Hungary and Mexico to
  0.998 of P3 parity; China and Siam to 0.957).
- The web autosave fails with a storage-quota error on the 1900 world (the known P5a issue;
  storage backend scheduled after P7).
- The food gluts and the clothing shortage of P5a remain.

**Not done (uncompleted plan items)**
- Performance (plan §5): held by the designer; the 450 ms budget is not met.
- Superseded on 2026-11-08 (§7): cotton by country, naphtha and residuum, the 1902
  electricity census, hydro potential and jewellery are done; the A12 crop tables are
  transcribed but not used for placement; the 1990 plastics price stays provisional.
- No tablet-size playtest; no device test (designer's).

**Acceptance criteria not verified**
- Ordinary day ≤ 450 ms and goods-scaled phases ≤ 2x (A11): not met (593 ms).
- `pnpm bench` after D-149: not run (designer's hold).

## 7. Additions of 2026-11-08

### 7.1 Behaviour

1. **Hydro (C-12, D-146 A8).**
   - **Source.** Hoes et al. (2017) was dropped because its 4TU terms allow only non-commercial reuse (designer). Province potential now comes from HydroSHEDS RiverATLAS v1.0 (CC BY 4.0; attribution in `docs/P5B_GOODS_PROVENANCE.md`).
   - **Extraction.** `scripts/p5b/extract-hydro-riveratlas.mjs` reads the git-ignored cache, which the designer downloaded because figshare refuses scripts. It computes outlet-to-outlet drops of conditioned elevations × mean discharge, giving 49.8 PWh/year gross in 1,622 provinces (Hoes et al.: 52).
   - **Simulation.**
     - `ProvinceEconomy.hydroPotentialMWhPerYear`: an optional encoded field in the unreleased schema 33.
     - `BuildingDef.usesHydroPotential` marks the hydro station.
     - A daily, non-depleting cap at `HYDRO_TECHNICAL_SHARE` 0.33 × potential ÷ 365.2425.
     - A construction room check (`hydroRoomPerDay`) and a world validator.
   - **1900 placement.** 72 hydro stations generate 23.8 % of electricity (the 1902 US water-wheel share), within each province's cap.
   - **Phone.** Protocol 22 adds the focused province's hydro capacity and room; the Construction screen shows the river flow left for a hydro station.
2. **Transcriptions (D-148 additions).**
   - Cotton shares from the USDA Yearbook 1901, tables A and B.
   - Petrol and fuel oil from the 1900 export unit values (Statistical Abstract 1901, table 49).
   - The 1902 central-station census (3.36 cents a kWh). It is kept as a cross-check only: at that price aluminium works lose money, so the reference price stays the provisional 1.0-cent bulk rate.
   - A12 crop figures from three newly cached sources approved by the designer (colonial abstract no. 38, Koloniaal Verslag 1901, the 1901 Brazil handbook): transcribed in `sources_1900.json` `crops1900`, not yet used for placement.
   - The Statistical Abstract 1992 has no plastics quantity.
3. **Jewellery (D-152).** Good 57, *Jewellery and plate*, made by *Jeweller and Silversmith* workshops from gold, silver and labour.
   - It is a luxury need calibrated to the Mint's 1900 world industrial consumption, new metal only.
   - The 44 workshops stand where the metal was worked in 1900.
   - Free coinage, a growing circulation and India's silver are deferred to P11 (program updated). The plan is `docs/P5B_GOLD_SILVER_PLAN.md`.

### 7.2 Files

- **Created:**
  - `scripts/p5b/extract-hydro-riveratlas.mjs`
  - `packages/data/data/historical/p5b/hydro_province_1900.json` (derived, CC BY 4.0)
  - `docs/P5B_GOLD_SILVER_PLAN.md`
- **Simulation:** `population/types.ts`, `population/state.ts`, `serialization.ts`, `constants.ts`, `economy/constants.ts`, `types.ts`, `definitions.ts`, `production.ts`, `construction.ts`, `resources.ts`, `validation.ts`, `state.ts`, `index.ts`.
- **Data loader:** `packages/data/src/historical.ts`.
- **Worker and app:** `landSnapshot.ts`, `protocol.ts`, `snapshot.ts`, `ConstructionScreen.tsx`, the generated bundles.
- **Generator:** `catalogue.mjs`, `build-goods-1900.mjs`, `placement.mjs`, `playtest-goods.mjs`; `sources_1900.json` (authored rows) and the regenerated p5b tables and scenarios.
- **Tests:** `economy/goods-catalogue.test.ts` (four hydro tests), `data/world-1900.test.ts` (1900 hydro and jewellery, save round trip of mixed potentials), `fixtures/provinces.ts`, `architecture/naming-audits.test.ts` (1900-world hash re-pinned by design).
- **Documents:** `DECISIONS.md` (D-148 additions, D-149 note, D-152), `docs/PROSPERITY_PROGRAM.md` (status, P11), `Fabric_of_Nations_GDD.md` (status), generated `docs/P5B_BEFORE_AFTER.md` and `docs/P5B_GOODS_PROVENANCE.md`.

### 7.3 Measurements (Node diagnostics; no device result is claimed)

- 6,299 buildings; covered value added 59.6 % of world GDP (58.4 % before).
- Modelled ÷ sourced 1900 output: gold 0.48 (0.27 before), silver 0.18 (0.005 before), cotton 2.49 (first measured: demand exceeds the 1900 commercial crop), coal 0.89, sugar 0.85.

### 7.4 Open items for the designer

- **Electricity:** one reference price cannot serve both retail lighting (3.36 cents) and bulk power (about 0.3 cent).
- **Cotton:** demand is 2.5× the 1900 commercial crop (China's crop and hand spinning are not in the source).
- **Jewellery:** the metal share of its value (0.5) is provisional; the 1900 census of manufactures (jewellery industry) is not cached.
- **A12 crops:** still pooled worldwide. Missing producers: Latin American coffee outside Brazil; Chinese and Japanese tea (cached as OCR text only); Ecuadorian, Bahian and São Tomé cocoa; the self-consuming tobacco producers; Congo rubber.
- **Hydro:** the hydro share outside the United States, and the technical share, are provisional.
- **Not run:** performance work and `pnpm bench` (designer's hold).


### 7.5 Commands executed (2026-11-08) and results

| Command | Result |
|---|---|
| `node --max-old-space-size=8192 scripts/p5b/extract-hydro-riveratlas.mjs` | wrote `hydro_province_1900.json`: 1,622 provinces, 49.8 PWh/year gross (8,340,795 reaches; 68,848 unplaced, 0.57 PWh/year) |
| `node scripts/p5b/build-goods-1900.mjs`, then `node scripts/p2/build-province-scenario.mjs` | regenerated; `--check` of both current |
| `node scripts/p2b/build-money-calibration.mjs --check`, `node scripts/p5/build-p5-world.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (152 decisions) |
| `node scripts/m14/monetary-terminology-audit.mjs` | passed |
| `pnpm test` (first run) | 8 failed of 1,430: seven from the save's column table (provinces with and without a hydro potential had different fields; fixed: the field is written for every province or none, with a regression check) and the 1900-world hash (re-pinned by design) |
| `pnpm test` (final run, after the fix) | **101 of 101 suites, 1,430 of 1,430 tests passed** |
| `pnpm typecheck` (final run) | **0 errors** |
| `pnpm -F @century/app export:web`, then `node scripts/p5b/playtest-goods.mjs` | 19/19 checks passed at 844 x 390 (new: 58 goods counted; a hydro station shows the province's river flow), no console errors, exceptions or failed loads |
| `pnpm app:export` | web, iOS and Android bundles exported |
| `pnpm bench`, perfPhases | not run (designer's hold) |

The `--check` mode of the hydro extraction recomputes the table from the cache (about an hour); it was not re-run after the final extraction. Without the cache it only confirms that the committed table parses.
