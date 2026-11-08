# P5b completion report — the goods catalogue (59 goods) and D-140

**Branch:** `prosperity/p5-land` (local commits only; nothing pushed).
**Decisions:** D-146 (designer decisions), D-147 (simulation mechanics), D-148 (1900
placement, data version v13), D-149 (D-140: metal standards and the mint window),
D-150 (currency actions), D-151 (protocol 22 and the phone screens), D-152 (demand for
gold and silver: jewellery in P5b, monetary demand to P11). The additions of 2026-11-08
(hydro, transcriptions, jewellery) are recorded in D-148 and D-152 and summarised in §7; the
A12 crop placement and the open-item findings of the same day are in §8 (D-148 items 9–11,
D-152 addition); the designer's decisions of the same day (raw silk, electricity, jewellery,
the cotton and wool proposal) are in §9 (D-148 item 12); the calibration as applied and A12
batch 4 are in §10 (D-148 item 13). §11 lists every item not completely resolved at the
close of P5b.
**Versions:** world schema 33, simulation 0.29.0, data `m3-economy-v13`, worker protocol
22, map bridge protocol 3.
**Status:** merged into `main` on the designer's instruction of 2026-11-08, with the
unresolved items listed in §11. The performance step (plan §5, §12 step 5) was held at the designer's request on 2026-11-07
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
  electricity census, hydro potential and jewellery are done; the A12 crop tables, at
  first transcribed only, are used for placement since §8; the 1990 plastics price stays
  provisional.
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
- *These four items are taken up in §8: the A12 crops are placed; electricity, cotton and jewellery have findings and proposals for the designer.*
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

## 8. Continuation of 2026-11-08: A12 crop placement and the open items

### 8.1 Behaviour

1. **A12 crops at their recorded 1900 producers (D-148 additions, item 9).**
   - **Sources (batch 2 of `crops1900`).** All were read from page images and are public domain; licences and attribution are in `docs/P5B_GOODS_PROVENANCE.md`.
     - USDA Yearbook 1905: tobacco crops of 33 producers in 1900. The rows reproduce the printed total of 2,201,193,000 lb.
     - USDA Yearbook 1906, headnote: China, Persia, most of Central America and the West Indies have no tobacco statistics.
     - Board of Trade foreign-countries abstract no. 30: China's and Japan's 1900 tea exports. These are the page images of the volume previously cached only as OCR text.
     - Ukers, *All About Coffee* (1922): coffee exports of Mexico, Guatemala, Salvador (January–June 1900), Costa Rica, Colombia (1899), Porto Rico and the Dominican Republic.
     - Bureau of the American Republics, *Venezuela* (1904): about 1,000,000 bags of 46 kg of coffee a year.
     - Walter Baker & Co., *Cocoa and Chocolate* (1899 and 1904): cocoa for Ecuador, Venezuela, Brazil and São Tomé, and the world total.
     - *India Rubber World* (1 February 1901): the Congo via Antwerp, and Gould's 1900 deliveries as the world estimate.
     - Colonial abstract no. 38: Lagos rubber.
   - **Coverage rule.** `A12_MIN_COVERAGE` is 0.75 (provisional), set in `scripts/p5b/placement.mjs`. When the rule passes:
     1. producers named without a figure make their own demand;
     2. the rest of world demand goes to the recorded producers in proportion to their kg, measured against the world estimate;
     3. the unrecorded share keeps the local-and-pooled rule.

     Below the threshold a good keeps pooling, and the report says so.
   - **Result.** All three goods now use sourced shares:

     | Good | Coverage before | Coverage after | Modelled ÷ sourced |
     |---|---:|---:|---:|
     | coffee-tea-cocoa | 59.5 % | 85.4 % | 2.26 |
     | tobacco | 5.6 % | 100 % | 0.95 |
     | rubber | 69.1 % | 84.1 % | 0.42 |

     Per crop, `docs/P5B_BEFORE_AFTER.md` (generated) gives coffee 63.0 → 81.2 %, tea 59.7 → 100 % (recorded sum), cocoa 22.6 → 84.4 %, tobacco 5.6 → 100 % and rubber 69.1 → 84.1 %.
   - **Effect on the 1900 world.**
     - 6,168 buildings (6,299 before).
     - Covered value added 59.3 % of world GDP (59.6 % before).
     - The B7 warehouse capacity per level of the three goods rises: it follows the largest market's output, so coffee-tea-cocoa goes from 214,053 to 7,209,700 kg.
     - The 1900-world hash is re-pinned by design.
2. **Electricity (D-148 additions, item 10): options for the designer; nothing changed.**
   - The census does not split kWh between lighting and power.
   - It gives 1.52 cents/kWh for private stations driven by water alone, with half of their sales from power (table 40, p. 48).
   - Large motors at Niagara paid $25 per horsepower a year (p. 39), which is 0.38 cent/kWh at continuous use.
   - Options: (a) 1.52 cents as the single price; (b) separate lighting and power goods; (c) keep 1.0 cent, now bounded by the sourced 0.38 and 1.52 cents.
3. **Cotton (D-148 additions, item 11): what drives the gap; nothing changed.**
   - *Yardstick.* Against the USDA 1905 world crop for 1900 (15,893,591 bales, which includes China, Asiatic Russia and India's mill use) modelled cotton is 1.94× the lint, not 2.49×. That crop still understates China (2¼ lb a head) and leaves out India's hand-spun cotton.
   - *Recipe.* The textile recipe takes only cotton and wool, so linen, hemp, jute and silk demand falls on cotton. Wool output is 11.3× its demand.
   - *Demand.* Clothing needs come to about 7 garments a person a year, at 0.5 kg of cloth each.
   - Calibration options are listed in D-148, item 11.
4. **Jewellery (D-152 addition): proposal; nothing changed.**
   - The 1900 census gives the value of products and cost of materials of jewellery, silversmithing, silverware and plated ware: materials are 46.8 % of value.
   - The Mint's US industrial gold and silver of 1900 is at most 32.7 % of those industries' value.
   - Proposal: metal share 0.5 → 0.33.

### 8.2 Files

- **Generator:** `scripts/p5b/placement.mjs` (A12 rule, `a12Records`) and `scripts/p5b/build-goods-1900.mjs` (A12 rows in the modelled ÷ sourced table, a coverage section).
- **Source rows:** `sources_1900.json`:
  - `crops1900`: batch 2, world estimates, self-supplied producers;
  - `industrialArts1900.census1900`;
  - `electricity1902.options`;
  - `cottonWorld1900`;
  - the picul and kin units;
  - eight new sources.
- **Regenerated:** the p5b tables, `docs/P5B_BEFORE_AFTER.md`, `docs/P5B_GOODS_PROVENANCE.md`, the worker scenario and the app worker bundle.
- **Tests:**
  - `data/world-1900.test.ts`: three A12 tests (the USDA rows reproduce the printed total; each good passes the rule; the producers stand where 1900 grew the crops);
  - `architecture/naming-audits.test.ts`: hash re-pinned by design.
- **Documents:** `DECISIONS.md` (D-148 items 9–11, D-152 addition), this report, the program and GDD status lines.
- **Git-ignored caches** under `.cache-p5b/`, one new folder per source:
  - `yoa1903` to `yoa1906`, `yoa1910`
  - `bot-foreign-abstract-29`
  - `ukers-coffee-1922`
  - `iba-venezuelageograp00inte`, `iba-coffee-1909`, `iba-bulletin-1899`
  - `baker-cocoa-1899`, `baker-cocoa-1904`
  - `irw-1901-02`
  - `census-manufactures-1900`
  - `us-statab-foreign-1909`
  - `webb-new-dictionary-1911`, `mulhall-dictionary-1899`

  Webb and Mulhall were consulted and not used: Webb has no 1900 figures, and Mulhall gives tea exports only.
- **Tool:** `.cache-p5b/tools/findtext.mjs` searches a PDF's text layer.

### 8.3 Open items for the designer

- Electricity: choose option (a), (b) or (c) (D-148 item 10).
- Cotton: choose a calibration, if any (D-148 item 11).
- Jewellery: apply the 0.33 metal share or keep 0.5 (D-152 addition).
- A12 calibration: coffee-tea-cocoa demand is 2.26× the world estimate and rubber 0.42×; neither is recalibrated.
- Still not covered: Haiti, Nicaragua and Cuba coffee; Centrals and Angolan rubber; China's domestic tea (self-supplied without a figure).
- Not run: performance work and `pnpm bench` (held at the designer's request).

### 8.4 Commands executed and results

| Command | Result |
|---|---|
| `node scripts/p5b/build-goods-1900.mjs`, then `node scripts/p2/build-province-scenario.mjs` | regenerated; `--check` of both current |
| `node scripts/p2b/build-money-calibration.mjs --check`, `node scripts/p5/build-p5-world.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (152 decisions) |
| `pnpm test` (first run) | 1 failed of 1,433: the 1900-world hash (re-pinned by design, D-148 item 9) |
| the three affected suites (naming audits, 1900 world, generated drift) | 44 of 44 passed |
| `pnpm typecheck` | 0 errors |
| `pnpm app:export` | web, iOS and Android bundles exported |
| `pnpm -F @century/app export:web`, then `node scripts/p5b/playtest-goods.mjs` | 19/19 checks passed at 844 x 390, no console errors, exceptions or failed loads (no UI change; run because the worker data changed) |
| `pnpm test` (final run) | **101 of 101 suites, 1,433 of 1,433 tests passed** (1,834 s) |
| `pnpm bench`, perfPhases | not run (skipped at the designer's request) |

No device result is claimed.

## 9. Second continuation of 2026-11-08: the designer's decisions

The designer chose electricity option (a), accepted the jewellery metal share of 0.33, asked for raw silk as a good in the textile recipe and for a cotton and wool calibration proposal, and authorised downloads for the remaining crop gaps (D-148 item 12, D-152 addition).

### 9.1 Behaviour

1. **A12 batch 3.**
   - Coffee: Haiti's 1897–98 exports; Nicaragua's crop interpolated to 1900; Salvador's 1901 exports in place of its half year (Ukers, pp. 280–281).
   - Rubber: Angola and the Ivory Coast (Kramrisch & Co., *India Rubber World*, March 1901, p. 179); Bolivia, 3,496,240 kg (*Bolivia*, 1904, p. 84), moved out of Pará's receipts.
   - Coverage after: coffee 85.4 %, rubber 91.4 %; coffee-tea-cocoa 88.4 %.
2. **Electricity:** reference price 1.52 cents per kWh (census 1902, table 40), 238 RUSD per MWh. Opening demand is 7,172 MWh a day (10,600 before).
3. **Raw silk (good 58):**
   - priced from the 1900 import value ($3.96 per lb);
   - made by 48 *Sericulture and Silk Reeling* farms at the Lyons estimate's 1900 shares;
   - an optional textile-mill input at the 1900 silk-to-cotton ratio (0.00536 kg per kg of cotton, elasticity 0.05).

   Modelled ÷ sourced silk is 1.68; demand is 1.94×, like cotton, and the residual cap trims output.
4. **Jewellery:** metal share 0.33 (1900 census); 49 jewellers.
5. **Cotton and wool proposal** (D-148 item 12, not applied), four changes applied together:
   - clothing and textile need quantities × 0.52;
   - cotton placed and reported at the 1905 Yearbook's world crop;
   - ranch wool 533 → 34.4 kg per throughput unit (world wool output = the listed 1900 clip, 913 M kg; it is 14,150 M kg today, worth about 323 bn RUSD a year at reference prices);
   - mill fibre 246.7 kg of cotton and 70 kg of wool per throughput unit.

   Expected: cotton about 0.93× and wool about 1.0× of their 1900 figures. The ranch's value added and covered GDP fall.
6. **Measured:** 6,209 buildings; covered value added 59.5 % of world GDP.

### 9.2 Files

- `scripts/p5b/catalogue.mjs`: good 58, the silk farm, `SILK_OPTIONAL`.
- `scripts/p5b/build-goods-1900.mjs`: silk price and optional input, electricity price, `lb` unit.
- `scripts/p5b/placement.mjs`: `transferFrom`.
- `scripts/p5b/playtest-goods.mjs`: 59 goods.
- `sources_1900.json`: batch 3, `outputs1900.silk`, `woolWorld1900`, two price rows, the jewellery unit row, three new sources.
- The regenerated tables and documents, the worker scenario and the app bundle.
- Tests:
  - `data/world-1900.test.ts`: a silk test; Angola and Bolivia rubber estates;
  - `architecture/naming-audits.test.ts`: hash re-pinned by design.
- `DECISIONS.md`, this report, and the program and GDD status lines.
- New git-ignored caches:
  - `irw-1901-01` to `irw-1901-12` (OCR text; PDFs of February and March)
  - `iba-bolivia-1904`
  - `cherington-wool-1916`
  - `nawm-bulletin-34`, `nawm-bulletin-36` (consulted, not used)

### 9.3 Open items for the designer

- Cotton and wool: apply the four-part proposal, or not (D-148 item 12).
- A12 calibration: coffee-tea-cocoa demand is 2.26× the world estimate and rubber 0.42×.
- Not covered: the Centrals and East Indian rubber, Peru's caucho (inside Pará's receipts), Honduras and Cuba coffee, Grenada and Haitian cocoa.
- Not run: performance work and `pnpm bench` (held at the designer's request).

### 9.4 Commands executed and results

| Command | Result |
|---|---|
| `node scripts/p5b/build-goods-1900.mjs`, then `node scripts/p2/build-province-scenario.mjs` | regenerated; `--check` of both current |
| `node scripts/p2b/build-money-calibration.mjs --check`, `node scripts/p5/build-p5-world.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (152 decisions) |
| naming audits, 1900 world and goods catalogue suites (before the re-pin) | 1 failed of 58: the 1900-world hash, re-pinned by design |
| `pnpm typecheck` | 0 errors |
| `pnpm app:export` | web, iOS and Android bundles exported |
| `node scripts/p5b/playtest-goods.mjs` | 19/19 checks passed at 844 x 390 (59 goods counted), no console errors, exceptions or failed loads |
| `pnpm test` (full run, after the re-pin) | **101 of 101 suites, 1,434 of 1,434 tests passed** (1,855 s) |
| `pnpm bench`, perfPhases | not run (skipped at the designer's request) |

No device result is claimed.

## 10. Third continuation of 2026-11-08: cotton and wool calibration, A12 batch 4

The designer approved the cotton and wool proposal and asked to finish closing the crop gap (D-148 item 13).

### 10.1 Behaviour

1. **Calibration** (`TEXTILE_CALIBRATION`, status estimated):
   - clothing and textile need quantities × 0.52 in every tier;
   - cotton placed at the 1905 Yearbook's world crop of 1900 (32 territories, now including China and Asiatic Russia);
   - ranch wool 34.4 kg per throughput unit (533.3 before);
   - mill fibre 246.7 kg cotton plus 70 kg wool per throughput unit.

   Result:

   | | Before | After |
   |---|---:|---:|
   | Modelled ÷ sourced cotton | 2.49 (commercial crop) | 0.97 (world crop) |
   | Modelled ÷ sourced silk | 1.68 | 0.97 |
   | Wool output ÷ demand | 11.3 | 0.96 (912 M kg against the listed 913 M kg clip) |
   | Ranch levels | 77,120 | 46,767 |
   | Textile mill levels | 11,640 | 5,002 |
   | Covered value added (share of world GDP) | 59.5 % | 40.7 % |
2. **A12 batch 4** (Bureau of the American Republics Monthly Bulletins, vols. X–XII, page images):
   - coffee: Haiti 1899–1900;
   - cocoa: Ecuador's 1900 crop and Santo Domingo's exports;
   - tobacco: Santo Domingo's exports;
   - rubber: Ecuador, Costa Rica, and Peru (Iquitos and caucho, moved out of Pará's figure).

   Coverage: coffee 85.6 %, tea 100 %, cocoa 88.9 %, tobacco 100 %, rubber 92.9 %; coffee-tea-cocoa 88.8 %.
3. **Searched, nothing usable:** Dutch East Indies rubber (lumped with gums), the Straits and India (values only), Grenada (no export table), Mexico (178,668 kg in 1902 only), the rest of Central America, Colombia, Cuba and Honduras coffee, and Haitian cocoa. These stay in the local-and-pooled residual.
4. **Measured:** 6,241 buildings.

### 10.2 Files

- `scripts/p5b/catalogue.mjs` (`TEXTILE_CALIBRATION`), `scripts/p5b/build-goods-1900.mjs` (ranch, mill, need factor, cotton bale unit).
- `sources_1900.json`: `outputs1900.cotton` from the 1905 world crop, `cottonCommercial1900` kept, batch 4, three bulletin sources.
- The regenerated tables and documents, the worker scenario and the app bundle.
- Tests:
  - `data/world-1900.test.ts`: cotton and wool calibration test;
  - `architecture/naming-audits.test.ts`: hash re-pinned by design.
- `DECISIONS.md` (D-148 item 13), this report, the status lines.
- New git-ignored caches: `iba-monthly-bulletins` (OCR text of 40 volumes), `iba-mb-monthlybulletin1001bure`, `-1101bure` and `-1202bure` (grayscale PDFs).

### 10.3 Open items for the designer

- Covered value added is now 40.7 % of world GDP, below the P2b "before" figure, which carried the ranch's wool.
- Coffee-tea-cocoa demand is 2.36× its world estimate and rubber 0.42×; neither is recalibrated.
- Flax, hemp and jute have no good.
- Not run: performance work and `pnpm bench` (held at the designer's request).

### 10.4 Commands executed and results

| Command | Result |
|---|---|
| `node scripts/p5b/build-goods-1900.mjs`, then `node scripts/p2/build-province-scenario.mjs` | regenerated; `--check` of both current |
| `node scripts/p2b/build-money-calibration.mjs --check`, `node scripts/p5/build-p5-world.mjs --check` | current |
| `pnpm -F @century/sim-worker scenario:build`, `pnpm -F @century/app build:worker` (and `:check`) | current |
| `node scripts/docs/decisions-index.mjs --check` | current (152 decisions) |
| naming audits, 1900 world and goods catalogue suites (before the re-pin) | 1 failed of 59: the 1900-world hash, re-pinned by design |
| `pnpm typecheck` | 0 errors |
| `pnpm app:export` | web, iOS and Android bundles exported |
| `node scripts/p5b/playtest-goods.mjs` | 19/19 checks passed at 844 x 390, no console errors, exceptions or failed loads |
| `pnpm test` (full run, after the re-pin) | **101 of 101 suites, 1,435 of 1,435 tests passed** (1,899 s) |
| `pnpm bench`, perfPhases | not run (skipped at the designer's request) |

No device result is claimed.

## 11. Unresolved items at the close of P5b (consolidated, 2026-11-08)

This section replaces the scattered open-item lists of §6–§10 as the single list to carry forward. It covers everything that is not completely resolved. The figures are from the final generator run (`docs/P5B_BEFORE_AFTER.md`) unless stated otherwise.

### 11.1 Acceptance criteria not met or not verified

- **Performance (A11, plan §5):**
  - The ordinary 1900 day measured 593 ms in Node against the 450 ms budget (2026-11-07, before the 2026-11-08 additions). The performance step was held by the designer and has not been done.
  - `pnpm bench` and perfPhases were not run after D-149 (designer's hold). No measurement exists for the final world (59 goods, 6,241 buildings).
- **No dynamic run of the final world.** The 92-day stability run (no failure; metal currencies convertible) and the market-health observations below predate the 2026-11-08 changes: hydro, jewellery, A12 placement, silk, the electricity price, the cotton and wool calibration. The test suite runs short simulations of the final world and passes; a long run has not been repeated.
- **Devices:** no tablet-size playtest and no device test (designer's). Only the 844 × 390 web playtest was run.

### 11.2 Calibration gaps (modelled ÷ sourced 1900 output)

- **Heavy industry and minerals are well below 1900:**

  | Good | Modelled ÷ sourced |
  |---|---:|
  | iron ore | 0.16 |
  | steel | 0.25 |
  | copper ore | 0.33 |
  | tin | 0.35 |
  | bauxite | 0.41 |
  | nitrates | 0.25 |
  | crude oil | 0.79 |
  | coal | 0.86 |

  Modelled demand for these comes from recipes and maintenance only. In 1900 most steel, timber and construction materials went into railways, buildings, ships and new plant: investment demand that arrives with housing (P6), infrastructure (P8) and company investment (P10).
- **Gold 0.48 and silver 0.18:** the rest of 1900 output is monetary demand, deferred to P11 (D-152).
- **Coffee-tea-cocoa 2.36× and rubber 0.42×** their world estimates. The household quantities come from the 1901 US budget at reference prices and were not recalibrated; rubber's only 1900 buyers are belting, hose, cable and tyres.
- **Aluminium: report bug.** The modelled ÷ sourced table shows 0.00 because the source table is in kg and the good is in tonnes. Modelled 9,988 t against 7,743 t sourced is about 1.29. To fix: give the aluminium row a kg-to-t conversion in `build-goods-1900.mjs` (`OUTPUT_UNIT_TO_SIM`).
- **Covered value added is 40.7 % of world GDP**, below the P2b "before" figure of 46.5 %, which carried the ranch's unrealistic wool. Twelve of 134 territories are above 100 % (the P2b farm-gate demand, a D-135 distortion left to P6). The residual cap (plan §8) still trims new sectors in Spain, Greece, Japan, the Ottoman Empire, Portugal, Russia and four microstates.
- **Measured before the latest changes and not re-measured:**
  - machinery, construction materials and fertiliser at the price ceiling in many markets in a 92-day run (route capacity, freight funding; fertiliser made only in gate markets);
  - the food gluts and the clothing shortage of P5a (clothing demand has since been halved);
  - Japanese, Spanish and Portuguese households short of services.

### 11.3 Provisional data and assumptions

- **A12 crops** (coverage of the world estimate: coffee 85.6 %, tea 100 %, cocoa 88.9 %, tobacco 100 %, rubber 92.9 %):
  - tea has no world total, so its figure is the recorded sum, and China's and Japan's domestic tea is self-supplied without a figure;
  - estimated rows: Venezuela coffee (about 1,000,000 bags), Nicaragua (interpolated), Colombia (1899), Salvador (1901), the Baker cocoa means, Angola and the Ivory Coast (Liverpool tons), the Congo (Antwerp arrivals), Peru (caucho placed in Peru, tons taken as metric), Ecuador cocoa (46 kg quintal);
  - missing producers: East Indian and Central American (except Costa Rica) rubber, Mexican rubber, Cuban and Honduran coffee, and Haitian, Grenadan, Surinamese and Colombian cocoa;
  - the coverage threshold (`A12_MIN_COVERAGE` 0.75) is provisional.
- **Cotton and wool** (`TEXTILE_CALIBRATION`, estimated, one pass):
  - the factors were fitted once on 2026-11-08 and are not re-fitted on each build;
  - the wool clip is mostly greasy wool while the good is priced as Boston wool;
  - the listed clip (eight producers) leaves out Russia and Asia;
  - flax, hemp and jute have no good;
  - China's cotton (net imports × 2¼ lb a head) and India's hand-spun cotton are understated in the source itself.
- **Silk:** China, Japan and India count exports only, so their domestic silk is not modelled. The crop band (46°) is provisional.
- **Electricity:**
  - 1.52 cents/kWh is the water-only stations' average, still about half lighting;
  - the hydro share outside the United States (the 1902 US water-wheel share) is provisional, as is the technical share 0.33;
  - opening electricity demand fell from 10,600 to 7,172 MWh a day with the new price.
- **Jewellery:** the metal share of 0.33 is an upper bound. Jewellers are labourers and clerks until P7's artisan professions.
- **Other provisional values:** the 1990 plastics price (placeholder); refinery yields; ore grades; machinery and electrical-equipment prices (materials-share rule); ship price; the densities of naphtha and residuum; the hydro method's headwater rule.
- **D-140 / D-149** (from §6):
  - a mint without cash cannot defend its currency against a metal inflow;
  - four currencies revalue once on day 1;
  - paper currencies, aggregates and dependencies of the Mint table are not activated.

### 11.4 Known defects and carried-over stages

- The web autosave fails with a storage-quota error on the 1900 world (P7b, storage backend). P5b makes saves larger.
- The map rebuild scripts do not reproduce the committed map (map-pipeline repair stage). The map steps were not run.
- `.cache-p5b/` (git-ignored) holds every downloaded source and the transcription tools. It is not in the repository, so a fresh clone cannot re-read the page images without re-downloading them; the URLs are in `sources_1900.json`.
