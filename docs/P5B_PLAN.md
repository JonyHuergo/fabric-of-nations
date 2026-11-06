# P5b plan — the 57-good catalogue

**Status:** Phase 1 plan for the designer's approval (2026-11-06). Nothing is implemented.
**Branch:** `prosperity/p5-land`. **Exception:** P3 (D-141), P4 (D-142, D-144) and P5a
(D-143) are still under review; the designer accepted an AGENTS.md §7 exception so P5b can
start before they are accepted.
**Inputs read:** AGENTS.md; `docs/PROSPERITY_PROGRAM.md` §4–§7; `docs/P5_GOODS_CATALOGUE_PROPOSAL.md`
(approved, 57 goods); `P5_COMPLETION_REPORT.md` §8–§11; D-130, D-135, D-136, D-142–D-145;
GDD §17J; the P5a code (`economy/agriculture.ts`, `resources.ts`, `resourceState.ts`,
`production.ts`, `market.ts`, `day.ts`); the P2b generator; the snapshot and app screens.

Decisions the designer must take before Phase 2 are collected in **§0**. Contradictions
found while planning are in **§10**, each with a proposed resolution; none has been
chosen silently.

---

## 0. Decisions needed before Phase 2

| # | Question | Recommendation | Section |
|---|---|---|---|
| D1 | Do armaments replace the money-only M10 equipment in P5b? | **Not in P5b.** Define the good and the arsenal; leave M10 as it is; do it in a later "state procurement" step together with D2. | §7.1 |
| D2 | Do pharmaceuticals feed the E5 public-health service in P5b? | **Not in P5b.** Households buy pharmaceuticals; no mortality effect until the same later step. | §7.2 |
| D3 | How do producers buy a good that cannot be stored (electricity)? | **Same-day allocation in production waves** (C-3, option A). | §10 |
| D4 | Level of 1900 output: sourced quantity, or modelled demand placed by sourced shares? | **Modelled demand, placed by sourced country shares**; report the modelled ÷ sourced ratio per good (C-4). | §6, §10 |
| D5 | Who buys capital goods (machinery, construction materials, electrical equipment, ships)? | **Maintenance inputs** replace part of the money upkeep (C-5). | §10 |
| D6 | Gold and silver had a mostly monetary use in 1900 (D-140 is unassigned). | Size the mines to non-monetary demand and report the monetary share as uncovered; D-140 stays separate (C-11). | §10 |
| D7 | Hydro power: a hydro-site data source with an unconfirmed licence. | Hydro stations only in provinces with an authored 1900 hydro plant until the licence is confirmed (C-12). | §2, §10 |
| D8 | Gate technologies that only 7 countries know in 1900 (steelmaking, electrical generation, chemical fertilizer). | Countries with sourced 1900 output of the gated good start knowing the gate (C-1). | §10 |

Smaller resolutions (C-6 to C-22) are listed in §10. I will proceed with my recommendations unless you choose otherwise.

---

## 1. The catalogue: unit, recipe, building, gate, price source

### 1.1 Conventions

- **Ids.** The eight existing goods keep their ids and keys (`grain` 0, `livestock` 1,
  `fish` 2, `cotton` 3, `wool` 4, `textiles` 5, `clothing` 6, `food-products` 7). Only the display
  names change ("Meat", "Processed food and drink"), so saves, needs and the P2b tables keep
  their references (C-18). New goods take ids 8–56 in catalogue order.
- **New `GoodDef` fields** (definitions, not saved):
  - `group`: one of the eight catalogue headings;
  - `storable`: false for electricity and the five services;
  - `tradeable`: false for electricity and services; false for natural gas until a country knows *pipelines*;
  - `priceBasis`: `"1900-wholesale"`, `"1990-producer"` or `"defined-unit"`;
  - `priceSourceRowIds`.
- **Reference price.** `basePrice1900RUSD` keeps its name; its meaning becomes "reference price in RUSD":
  - a 1900 good: 1900 US price × 15.704;
  - a later good: its 1990 US producer price, already RUSD.
  
  The price band (0.25–4 × reference) is unchanged (C-7).
- **Recipes.** Physical units per throughput unit (TU), 1,000 jobs per level (P2b).
  - Coefficients come from the US Census 1900 *Manufactures* "materials used" tables where they exist. Otherwise they come from engineering ratios of the period, cited as rows.
  - All are provisional until calibrated. The quantities below are planning values; the generator will cite a row for each.
- **Extraction.** Every mine, field, works and logging camp is tied to one deposit (`BuildingInstance.depositId`). It takes its raw material **only through `extractFromDeposit`**. Output is in the deposit's unit, scaled by `quality`, and stops when the deposit is exhausted (§4.2).
- **Gates.** `BuildingDef.requiredTechnologyId` (existing). A good has no gate of its own: it is available where some building that makes it is unlocked.
  - Need items get `requiredTechnologyKey`.
  - A need item is active for a block when the block's country knows that technology **or** the good is in stock in the block's market that morning, for example imports (C-21).

Professions: P = peasants, L = laborers, C = clerks, K = capitalists, A = academics (the five
current professions; P7 adds the rest).

### 1.2 Food and agriculture (9)

| # | Good | Unit | Building: recipe (per TU, planning values) | Gate | Price source |
|---|---|---|---|---|---|
| 0 | Grain | kg | subsistence, commercial, mechanised farms (existing; cropland) | — / mech. agriculture (1) | P2b: NBER wheat (unchanged) |
| 1 | Meat (`livestock`) | kg | ranch (existing; pasture; joint wool) | — | P2b: NBER cattle |
| 8 | Dairy and eggs | kg milk-eq. | dairy farm: pasture + grain feed (≈0.3 kg/kg) | — | BLS Bull. 39: milk, butter, cheese, eggs → milk-equivalent composite (weights provisional) |
| 2 | Fish | kg | fishery (existing) | — | P2b rule (= meat) |
| 9 | Fruit and vegetables | kg | market garden (cropland) | — | BLS Bull. 39: potatoes, onions, beans, apples composite |
| 10 | Sugar | kg | sugar estate (cane, cropland, cane band) and beet-sugar works (cropland, temperate) | — | BLS Bull. 39: granulated sugar, New York |
| 11 | Coffee, tea and cocoa | kg | plantation (cropland, tropical band) | — | BLS Bull. 39: coffee (Rio No. 7), tea; cocoa from US import unit value (Stat. Abstract 1901); weights by 1900 world output |
| 12 | Tobacco | kg | tobacco farm (cropland) | — | USDA Yearbook 1900: farm price of leaf tobacco |
| 7 | Processed food and drink | kg | food processing (existing flour mill) and food-and-drink works: grain, sugar, meat, dairy, produce (brewing, canning, meat packing) | — | P2b flour price (unchanged good) |

**Crop bands** (C-8) are derived from each province's centroid latitude, plus every province with sourced 1900 output of the crop:
- cane ≤ 32°;
- coffee, tea and cocoa ≤ 25° (tea ≤ 36°);
- rubber ≤ 15°;
- cotton ≤ 42°.

This is deterministic and needs no new licence; GAEZ is not used.

### 1.3 Fibres and forest (5)

| # | Good | Unit | Building: recipe | Gate | Price source |
|---|---|---|---|---|---|
| 3 | Cotton | kg | **cotton farm** (cropland, cotton band); removed from the commercial farm's joint output (C-8) | — | P2b: NBER cotton |
| 4 | Wool | kg | ranch (joint, unchanged) | — | P2b: NBER wool |
| 13 | Rubber | kg | rubber estate (tropical; wild and plantation rubber); synthetic rubber plant: chemicals + crude oil | — / petrochemicals (47) | BLS Bull. 39: India rubber, Para |
| 14 | Timber | m³ | logging camp and sawmill: **extracts the timber deposit** | — | US Census 1900 *Lumber and timber products*: value ÷ board feet (1 MBF = 2.36 m³) |
| 15 | Paper | t | paper mill: timber ≈3 m³, chemicals 0.15 t, coal 1.5 t | — | BLS Bull. 39: news and wrapping paper; Census 1900 paper unit value |

### 1.4 Mining (11) — each an extraction building on a deposit

| # | Good | Unit = deposit unit | Building | Gate | Price source |
|---|---|---|---|---|---|
| 16 | Coal | t | coal mine | — | Stat. Abstract 1901: US coal output value ÷ tonnage (at mine) |
| 17 | Crude oil | t | oil field | — | BLS Bull. 39: crude petroleum (Pennsylvania, per barrel); 7.33 bbl/t |
| 18 | Natural gas | 1,000 m³ | gas field; local only until pipelines (C-15) | — (trade: *pipelines*, new) | Mineral Resources of the US (first volume series, 1906) back to 1900 with the fuel-price relative; provisional |
| 19 | Iron ore | t Fe | iron mine | — | Lake Superior ore price per gross ton (The Mineral Industry 1900) ÷ grade |
| 20 | Copper ore | t Cu | copper mine | — | Census *Mines and Quarries 1902*: ore value at mine per t Cu, to 1900 with the BLS copper relative |
| 21 | Bauxite | t | bauxite mine | — | The Mineral Industry 1900 (US bauxite value per long ton) |
| 22 | Nitrates | t N | nitrate works (oficina) | — | Stat. Abstract 1901: nitrate-of-soda import unit value ÷ 0.165 N |
| 23 | Uranium | t U | uranium mine | *nuclear power* (new) | 1990: EIA *Uranium Industry Annual* (price paid by US utilities, U₃O₈ → U) |
| 24 | Tin | t (metal) | tin mine and smelter | — | BLS Bull. 39: pig tin, New York |
| 25 | Gold | kg | gold mine | — | statutory US mint price, $20.67183 per troy ounce (Gold Standard Act 1900) |
| 26 | Silver | kg | silver mine | — | BLS Bull. 39: bar silver, New York |

### 1.5 Energy (4)

| # | Good | Unit | Building: recipe | Gate | Price source |
|---|---|---|---|---|---|
| 27 | Kerosene | t | refinery: crude oil 1 t → joint kerosene, petrol, diesel and fuel oil at 1900 US yields (Census 1900 petroleum refining products), losses recorded | — | BLS Bull. 39: refined petroleum (export, per gallon) |
| 28 | Petrol | t | refinery (joint) | — | Census 1900 refining: naphtha and gasoline unit value |
| 29 | Diesel and fuel oil | t | refinery (joint; residuum, gas oil and lubricants grouped) | — | Census 1900 refining: fuel oil and residuum unit value |
| 30 | Electricity | MWh | **not storable, not tradeable**. Coal station (coal ≈3 t/MWh at 1900 rates, later methods lower), oil station (fuel oil), gas station (gas), hydro station (no fuel; hydro site, C-12), nuclear station (uranium) | electrical generation (15); nuclear: *nuclear power* (new) | Census *Central Electric Light and Power Stations 1902*: income ÷ kWh |

### 1.6 Industrial materials (8)

| # | Good | Unit | Building: recipe | Gate | Price source |
|---|---|---|---|---|---|
| 31 | Steel | t | steel works: iron ore 1.05 t Fe, coal ≈2.0 t (coke and fuel) | steelmaking (6) | BLS Bull. 39: Bessemer steel billets, Pittsburgh |
| 32 | Copper | t | copper smelter and refinery: copper ore 1.02 t Cu, coal 1.5 t | — | BLS Bull. 39: Lake copper ingot |
| 33 | Aluminium | t | aluminium works: bauxite ≈4 t, electricity ≈22 MWh, coal 0.6 t (anodes) | electrical generation (15) | The Mineral Industry 1900: US aluminium price (1900 good, so 1900 price) |
| 34 | Chemicals | t | alkali and acid works: coal 2 t, nitrates 0.02 t N; petrochemical plant: crude oil or gas | — / petrochemicals (47) | BLS Bull. 39: sulphuric acid, soda ash, alum composite (weights from Census 1900 chemicals) |
| 35 | Fertiliser | t nutrient | fertiliser works: nitrates and chemicals; nitrogen-fixation plant: gas or coal, electricity | chemical fertilizer (7) / nitrogen fixation (26) | Stat. Abstract 1901 nitrate unit value per t N (provisional) |
| 36 | Plastics | t | plastics plant: chemicals 1.2 t, crude oil or gas | plastics (31) | 1990: Census *Current Industrial Reports* (plastics materials and resins), shipments ÷ tonnage |
| 37 | Construction materials | t | cement and brick works: coal 0.25 t (local stone and clay are not goods) | — | BLS Bull. 39: Portland cement and common brick, by weight |
| 5 | Textiles | kg | textile mill, power-loom mill (existing); synthetic fibre plant: chemicals | — / power loom (9) / synthetic fibers (51) | P2b (unchanged) |

### 1.7 Capital and transport equipment (7)

| # | Good | Unit | Building: recipe | Gate | Price source |
|---|---|---|---|---|---|
| 38 | Machinery | t | machine works: steel 1.1 t, copper 0.03 t, coal 1 t | — | derived: steel cost per t ÷ US Census 1900 *foundry and machine shop* materials-to-product ratio (no tonnage price exists) |
| 39 | Electrical equipment | t | electrical works: copper 0.4 t, steel 0.7 t | electrical generation (15) | derived as machinery, from Census 1900 *electrical apparatus and supplies* |
| 40 | Electronic components | unit-eq. (= 1 RUSD of 1990 components at producer prices) | electronics plant: chemicals, plastics, copper | transistors (41); integrated circuits (60) as method | defined unit: 1.0 RUSD; quantity from Census 1990 CIR semiconductors shipments |
| 41 | Motor vehicles | vehicle | motor works: steel 1.0 t, rubber 0.05 t, machinery 0.1 t, textiles, construction materials (glass) | internal combustion (16); assembly line (21) as method | 1990: MVMA *Facts & Figures 1991* factory wholesale value per vehicle (C-10) |
| 42 | Aircraft | aircraft-eq. = 1 t airframe empty weight (C-13) | aircraft works: aluminium, machinery, electronic components | air transport (27) | 1990: *Aerospace Facts and Figures 1991* shipments value ÷ airframe weight (derived) |
| 43 | Ships | gross tonne | shipyard: steel 0.45 t/GT, machinery 0.1 t, timber 0.3 m³ | — | Lloyd's / British shipbuilding prices 1900 per GT (secondary) |
| 44 | Armaments | equipment unit (M10's unit) | arsenal (state or private): steel, chemicals, machinery | — | the P2b M10 equipment price (`equipmentPriceRUSD`), so procurement and the good agree (D1) |

### 1.8 Consumer manufactures (8)

| # | Good | Unit | Building: recipe | Gate | Price source |
|---|---|---|---|---|---|
| 6 | Clothing | garment | workshop (existing) | — | P2b (unchanged) |
| 45 | Household goods | unit-eq. (= 1 US$ of 1900 furniture and housewares at wholesale) | furniture and housewares works: timber, textiles, steel (plastics later) | — | defined unit: 15.704 RUSD |
| 46 | Household appliances | appliance | appliance works: steel, electrical equipment, plastics | refrigeration (17) | 1990: Census CIR *Major household appliances* shipments ÷ units |
| 47 | Radios | device | radio works: electrical equipment (later electronic components), plastics | radio (23) | 1990: Electronic Industries Association, factory sales ÷ units |
| 48 | Televisions | device | television works: electronic components, plastics | television (46) | as radios |
| 49 | Computers | device | computer works: electronic components, plastics | personal computers (80) | 1990: Census CIR *Computers and office equipment* |
| 50 | Mobile phones | device | phone works: electronic components, plastics | mobile telephony (81) | 1990: industry factory price (EIA / CTIA), secondary |
| 51 | Pharmaceuticals | dose-eq. (= 1 US cent of 1900 drugs at wholesale) | pharmaceutical works: chemicals | —; antibiotics production (53) as method | defined unit: 0.15704 RUSD; quantity from Census 1900 *patent medicines and compounds* and *drugs* value |

### 1.9 Services (5) — not storable, not tradeable

Unit: **service unit = 1 RUSD of service at 1900 US prices**; reference price 1.0 RUSD (C-6).

| # | Good | Building (jobs) | Inputs | Gate |
|---|---|---|---|---|
| 52 | Commerce | trading house (C, L) | paper (small) | — |
| 53 | Transport services | railway and shipping company (L, C) | coal; maintenance: machinery, ships; diesel and petrol after trucking (28) | — |
| 54 | Communication | post and telegraph office (C, L) | maintenance: electrical equipment; telephone networks (36), internet (82) as methods | — |
| 55 | Finance and professional services | bank and office (C, K, A) | paper | — |
| 56 | Personal and recreation services | personal services (L, C) | — | — |

Services employ clerks, capitalists and academics, the professions P2b left without covered jobs (D-135).

### 1.10 Buildings and technologies

- About 58 new building definitions; with the 12 existing, about 70.
- The E4 sectors gain `mining`, `energy` and `services`, which adds rows to the industrial-policy table (C-16). Chemicals, metals and equipment use `manufacturing`.
- Warehouses store every storable good. Capacity per level and good is sized by the good's 1900 daily world output (C-19).
- New technologies (content, data version v13):
  - **pipelines** (era 2; prerequisite steelmaking): makes gas tradeable;
  - **nuclear power** (era 3; prerequisites electrification 25 and industrial laboratories 39): unlocks uranium mines and nuclear stations.

---

## 2. Data sources and licences

USGS blocks scripted downloads (HTTP 403). The MRDS and SAGE downloads still work. Wherever a USGS series is needed, I enter the value by hand from the cited table, with volume, table and page, and status `transcribed`. Every row goes in a new source table, `historical/p5b/sources_1900.json`, with the P2b row format: id, value, unit, citation, licence and status (sourced, secondary, derived or provisional). Phase 2 step 0 is a fetch audit: a row whose source I cannot open is marked `secondary` and listed for you, never presented as sourced.

| Data | Source | Licence | Access (checked 2026-11-06) |
|---|---|---|---|
| 1900 mineral output by country (coal, iron ore, pig iron, steel, copper, tin, gold, silver, petroleum, bauxite, aluminium, nitrate of soda, cement, sulphuric acid) and US prices | *The Mineral Industry, its Statistics, Technology and Trade … to the end of 1900*, vol. IX (ed. Struthers; Scientific Publishing Co., New York, 1901) | public domain (US, before 1929) | scans of the series exist; vol. IX itself still to be located (HathiTrust or Internet Archive) |
| US mineral output and prices, cross-check | USGS *Mineral Resources of the United States 1900*; USGS DS-140 historical statistics | US Government, public domain | usgs.gov blocks scripted access: values are transcribed by hand |
| Iron and steel by country | American Iron and Steel Association, *Annual Statistical Report 1900* (Swank) | public domain | library scans |
| Crops: sugar (cane and beet), coffee, tea, cocoa, tobacco, cotton, wool, rubber | USDA *Yearbook* 1900 and 1901 statistical tables; US Treasury Bureau of Statistics, *Statistical Abstract for the Principal and Other Foreign Countries* (1901); UK Board of Trade, *Statistical Abstract for the Principal and Other Foreign Countries* | public domain; UK Crown copyright expired | scans |
| Timber | Zon & Sparhawk, *Forest Resources of the World* (1923); US Census 1900 *Lumber* | public domain (US, before 1929) | scans |
| Manufactures: paper, chemicals, machinery, electrical equipment, furniture, drugs, ships, food and drink; recipe inputs | US Census 1900, vols. VII–X *Manufactures* (products and materials used); UK *Census of Production* 1907 and German *Gewerbezählung* 1907 for shares | public domain | scans |
| Manufacturing shares where no census exists | Bairoch (1982), shares of world manufacturing | © (facts cited, tables not reproduced) | used for provisional shares only |
| Electricity 1900–1902 | US Census, *Central Electric Light and Power Stations 1902* | public domain | scans; other countries provisional (§6) |
| Ships 1900 | Lloyd's Register, annual shipbuilding summary 1900 | out of copyright by age | secondary reprints |
| Services value added | US: Gallman & Weiss (1969), NBER *Studies in Income and Wealth* 34; UK: Feinstein (1972); others derived from GDP per head (provisional) | © (facts cited) | NBER chapters online |
| 1900 US wholesale prices | BLS Bulletin 39, *Course of Wholesale Prices, 1890 to 1901* (1902), Table 1; NBER Macrohistory (as P2b); *Statistical Abstract of the United States 1901* (unit values) | public domain | FRASER hosts the BLS bulletin series ([search](https://fraser.stlouisfed.org/title/bulletin-united-states-bureau-labor-3943/march-1903-477603/fulltext)) |
| Household budget, 1901 | 18th Annual Report of the Commissioner of Labor (1903), *Cost of Living and Retail Prices of Food* (fuel, light, furniture, tobacco, liquor, books and papers, sickness, amusements, insurance); P2b already uses its food and apparel rows | public domain | FRASER |
| 1990 producer prices (later goods) | *Statistical Abstract of the United States 1992*; EIA *Annual Energy Review* and *Uranium Industry Annual*; Census *Current Industrial Reports* 1990 | public domain | archived Census PDFs ([UNT archive](https://webarchive.library.unt.edu/eot2008/20090103191340/http:/www.census.gov/prod/www/abs/statab1951-1994.htm)) |
| 1990 prices, industry sources | MVMA *Facts & Figures* 1991; Aerospace Industries Association; Electronic Industries Association | © (single facts cited) | secondary |
| Hydro-site potential | Hoes et al. (2017), *PLOS ONE* 12(2): e0171844 ([article](https://pmc.ncbi.nlm.nih.gov/articles/PMC5298288/)) | article CC BY 4.0; **dataset licence not confirmed** | D7 |
| Crop bands | province centroid latitude from the project's own province geometry | project data | derived |
| Deposits | P5a tables (USGS MRDS, authored), plus authored rows for missing 1900 producers (C-2) | MRDS public domain; authored | as P5a |

---

## 3. Data version, schema, protocol and saves

| Item | Now | P5b | Reason |
|---|---|---|---|
| Data version (`DATA_PACKAGE_VERSION`, `technology.json`) | `m3-economy-v12` | **`m3-economy-v13`** | new goods, buildings, needs, two technologies |
| World schema (`WORLD_SCHEMA_VERSION`) | 32 | **33** | `BuildingInstance.depositId`; 57-wide price arrays; three new E4 sectors in each country's industrial policy |
| `SIM_VERSION` | 0.28.0 | **0.29.0** | behaviour change |
| Worker protocol | 21 | **22** | sparse market detail, `SET_MARKET_FOCUS`, goods `group` and availability, grouped project types |
| Map bridge protocol | 3 | 3 | no new lens planned |

**Save compatibility (D-120).** Schema-32 saves, and data-v12 saves, are listed as incompatible with the reason ("made before the full goods catalogue"). They are never deleted or overwritten. `serialization/save-compatibility.test.ts` gains the schema-32 row.

**Save size.** Prices, lots and per-good arrays grow, and building count roughly doubles. I will measure stored characters at days 3, 92 and 366 against P5a, as P5a did. The web save quota failure (P5a report §6, open item 3) already happens on `main`; P5b makes it worse, not better. The storage-backend change stays yours to schedule.

---

## 4. Simulation changes (what code changes, smallest complete form)

1. **Definitions:**
   - the new `GoodDef` fields;
   - `BuildingDef.extracts?: ResourceKind`, with an output unit that must equal `RESOURCE_UNITS`;
   - `optionalInputs` with an output elasticity, used only by farms for fertiliser (C-9);
   - `maintenanceInputs`, per level per day (C-5);
   - need-item `requiredTechnologyKey`.
   
   The validator rejects:
   - an unknown good;
   - a unit mismatch;
   - a non-storable recipe input without same-day allocation (C-3);
   - a cycle among non-storable goods;
   - a gate that does not exist.
2. **Extraction.**
   - Capacity of an extraction building = staffing × technique × deposit quality × technology.
   - Production asks `extractFromDeposit` for the day's quantity and produces exactly what it returns. The world's deposit state is the only stock.
   - A sorted-id index is passed to `extractFromDeposit` (a binary search instead of `find`). It is still the only depletion path.
   - World creation and construction reject an extraction building without a discovered deposit of its kind in its province. Construction picks the deposit with the largest remaining stock, lowest id on a tie.
3. **Non-storable goods.** No storage capacity, so unsold output is recorded overflow loss (curtailment). Trade dispatch skips goods that are not tradeable.
4. **Same-day allocation (D3, option A).**
   - Buildings whose outputs are non-storable produce in a first wave, from opening stock.
   - Their output is then allocated to producers' non-storable input demand by the existing tier and pairing order.
   - Then the other buildings produce. Households still buy in Pass B.
5. **Fertiliser** is an optional input of commercial and mechanised farms. Output × (1 − e + e × fill), where e is provisional, 0.2.
   - World creation divides the technique by the 1900 factor, as for land, so day-0 output is unchanged.
   - Machinery stays the mechanised-farm recipe (P5a).
6. **Maintenance (D5).**
   - Each building buys `maintenanceInputs` as producer demand at tier 5 (non-critical). Their value at reference prices is taken out of the money upkeep.
   - An unfilled share keeps its cash in the building and is recorded as `maintenanceShortfall`.
   - Condition decay is deferred to P10 and recorded in DECISIONS.
7. **Need gating:** the C-21 rule, checked in `buildHouseholdDemand` with a per-market, per-day mask.
8. **No new pools.** Every new quantity is a stock (deposits, lots) or a flow made by workers, land and inputs (No-Mana Doctrine). All coefficients go in `economy/constants.ts` with units, justification and status.

---

## 5. Performance plan (market phase: 8 goods → about 35 per market)

**Baseline today** (P5a build, `node packages/bench/dist/perfPhases.js 2 12`, Node 24, Windows, Ryzen 5 2600, 2026-11-06): **mean ordinary day 301 ms**.

Phases that scale with goods:

| Phase | ms |
|---|---:|
| settlement | 67.8 |
| market clearing | 48.9 |
| household demand | 26.5 |
| needs | 20.8 |
| trade dispatch | 18.1 |
| production demand | 4.4 |
| **Total** | **≈186** |

**Risk.** Without changes these phases grow roughly with demand records and lots: about 3–4× here, which means an ordinary day near 0.8–1 s.

**Method.**
1. Re-measure `perfPhases` and `perfBench 92` on P5a at the start of Phase 2.
2. Measure again after the catalogue lands, before any optimisation, with `--cpu-prof` on 10 days.
3. Optimise only what the profile shows.
4. After each step, check that every legacy fixture and the P5b 1900 world give bit-identical hashes (as P1 did).

**Likely work, in this order** (each kept only if the profile shows it):
1. Per-market lists of the goods present. Price update, overflow, sellable supply and the snapshot capacity visit only present goods. A price with no demand and no supply does not move today either, so skipping it does not change results.
2. Household demand: tier item vectors resolved once per day per market (the gating mask), not per block.
3. Trade dispatch: per day and good, drop routes where the destination price cannot cover origin price plus freight before visiting sellers.
4. Settlement and pairing: grow the existing columns; no new per-transaction objects.
5. The deposit index (§4.2).

**Proposed budget** (your call): ordinary-day mean **≤ 450 ms** in Node (1.5× P5a), and the goods-scaled phases ≤ 2× today. If the budget is missed, I report the profile and stop rather than cut model detail (GDD §17J.2.1).

**Reported** (Node diagnostics only; no device claims):
- `pnpm bench`;
- `perfPhases`;
- `perfBench 92`: host day p50/p95/p99, per phase, snapshot ms and bytes, save and load, heap.

The century benchmark is not run.

---

## 6. Snapshot-size plan

**Measured today:** 524,263 characters (DEU player, day 2). The 700,000 bound is in `data/world-1900.test.ts`.

| Key | Characters |
|---|---:|
| `provinceTable` | 187,490 |
| `markets` | 112,837 |
| of which `prices` (63 markets × 8 goods) | 84,162 |
| `countrySummaries` | 46,976 |
| `technologyCatalog` | 45,149 |

At 57 goods the price rows alone would be about 600 k.

**Plan (protocol 22):**
1. **Detail only where it is read.** `markets[].prices` is filled for:
   - the player country's markets;
   - the focus country's markets (what the Country and Trade screens read);
   - one **focused market**, set with `SET_MARKET_FOCUS` from the Markets screen.
   
   Other markets carry `prices: []` and `detail: "summary"`.
2. **Only goods present** in that market (producer, stock or demand). The UI shows the rest as "not traded here".
3. **Compact rows.** Drop `goodKey`, `goodName` and `unitLabel` from each row; the UI looks them up in `snapshot.goods`.
4. Goods (57, with group and availability), need tiers, and project types grouped by sector.

**Estimate:** about 480 k characters for DEU. To be measured.

**Tests:** the bound is asserted for several players (GBR, the largest market; USA; DEU) and with a large focused market.

---

## 7. The two open designer decisions

### 7.1 D1 — Armaments and M10 equipment: recommend **not in P5b**

- **Today.** M10 recruitment and upkeep pay `equipmentPriceRUSD` and `equipmentDailyUpkeepRUSD` from the treasury to the system reserve, a money sink. Equipment exists the moment it is paid for.
- **What replacing it means.**
  - The state becomes a market buyer. The construction-material procurement in `construction.ts` is a model for this.
  - Recruitment equips only what was bought, so equipment is no longer instant.
  - Equipment upkeep becomes physical maintenance.
  - Arms can be traded and tariffed.
  
  This changes M10 behaviour and its accepted tests (military, military-recruitment, country AI), adds a buyer kind to the market phase, and the 1900 arms-output data are weak.
- **Recommendation.**
  - P5b defines armaments and the arsenal (gate none), places no 1900 arsenals and adds no demand.
  - M10 stays money-only.
  - A later "state procurement" step, next to P12 (state ownership) or as its own small stage, does armaments, D2 and public construction together.
  
  If you prefer it in P5b, it is a self-contained step after the calibration (§11 step 6b), with its own M10 regression set.

### 7.2 D2 — Pharmaceuticals and E5 public health: recommend **not in P5b**

- **Today.** E5's public-health service is staff (administration clerks). P4 mortality reads its coverage (D-142), and P4's tests are pending your revision.
- **What feeding it means.** The service would buy pharmaceuticals, and its mortality effect would depend on doses delivered. That is a new causal term in P4.
- **Recommendation.** In P5b, households buy pharmaceuticals in the comfort and luxury tiers, sized to the BLS 1901 "sickness" spending net of doctors (who are personal services). There is no mortality effect, and the UI says so. The E5 link comes with D1's state-procurement step, after P4 is accepted.

---

## 8. Value-added recalibration and GDP coverage

**Method: the P2b method (D-135 A2, A3) extended to every sector.**

1. **Demand.**
   - Comfort and luxury quantities of the new goods come from the BLS 1901 budget categories. The category-to-good map is a provisional row. Rent is excluded (housing is P6, C-17).
   - The A4 scaling widens from food and apparel to the whole non-rent budget.
   - Intermediate demand follows the recipes and the maintenance inputs.
2. **Placement.** Each 1900 good's world total is split into country shares from the sourced output. Within a country it is split by:
   - discovered deposit stock × quality, for mines;
   - suitable land, for crops;
   - urban population, for manufactures and services;
   
   always in provinces where the owner profession lives.
3. **Level (D4).** Per good, the world level equals modelled demand at opening prices, solved from final goods back to raw materials. The report lists modelled ÷ sourced output per good. Option B, level equal to the sourced output, is available; it produces gluts where demand is not modelled (capital goods before P10, monetary gold, petrol before cars).
4. **Technique and level** per building: value added per level = wage bill ÷ labour share + upkeep, at market prices. The workforce cap (95 %) is unchanged.
5. **Existing sectors are re-solved** with the same rules: cotton becomes its own farm, and fertiliser and maintenance enter. Grain, meat and fish keep their P2b physical quantities.
6. **Fiscal coefficients** that scale with covered value added (A5: tax base, education, administration, treasury, debt ceiling) are recomputed from the new coverage. This changes 1900 treasuries.

**Coverage today** (`p2b/calibration_1900.json`):

| Area | Covered share of GDP |
|---|---:|
| World (482 of 1,037 bn RUSD) | 46 % |
| United States | 40 % |
| United Kingdom | 27 % |
| Germany | 51 % |
| British India | 21 % |
| Russia | 84 % |
| Japan | 94 % |

Seven territories are above 100 %: Portugal, Greece, and five microstates.

**Expected:**
- the world rises to roughly 75–90 %, the US and UK to roughly 85–95 %;
- the remainder is housing (P6), government (counted separately) and unmodelled activity.

These are estimates, to be measured.

**Problem.** Where P2b coverage is already ≥ 80 % (15 of 134 territories, 14 % of population), new sectors at their sourced shares would push coverage past GDP. Proposed rule:
- new sectors there are capped at the residual (GDP − covered goods value added), and the overshoot is reported;
- the P2b agricultural overshoot comes from the BLS retail budget applied to farm-gate demand, a known D-135 distortion;
- correcting it is P6's demand work, not P5b's.

**Report:** `docs/P5B_BEFORE_AFTER.md`, with per-territory coverage before and after, sector shares against the sourced ones (US, UK, Germany, Japan), and employment by profession.

---

## 9. Test plan

Tests go in the subsystem folders (D-145).

| Kind | Tests (folder) |
|---|---|
| Unit | `economy/definitions`: 57 goods, ids, groups, units, recipe goods, extraction unit = deposit unit, non-storable rules, gates exist. `money/money-calibration` (new P5b block): every reference price recomputed from its source rows and conversion. `economy/production`: extraction output = `extractFromDeposit` return × quality; an exhausted mine makes 0; refinery joint outputs; optional fertiliser input normalisation. `economy/construction`: no mine without a discovered deposit; gates enforced. `population/needs`: need gating by technology or stock. `economy/market-clearing`: same-day non-storable allocation and curtailment. |
| Regression | one per bug found; legacy fixtures (M2–M5, M11 legacy definitions) keep bit-identical hashes through the performance work; digests that change are listed with reasons. |
| Determinism | `determinism/replay`: two runs over 92 days of the 1900 world are identical; staged = phase mode; rollback replay with extraction and discovery. |
| Save round trip | `serialization/economy-roundtrip`: schema 33 with `depositId` and depletion, load-continue hash equality; schema-32 rejection in `save-compatibility`. |
| Conservation | **Goods:** opening + output + arrivals = sales + consumption + overflow (including curtailment) + closing, per market and good, daily. **Money:** designated-cash conservation (unchanged invariant) through maintenance purchases. **Deposits:** initial = remaining + extracted, and the day's rise in `extracted` = the day's mine output in deposit units, exactly. **Population:** unchanged invariants on the 1900 world. |
| 1900 world | `data/world-1900`: all selectable countries initialise; every 1900 good has producers; placement shares match sources within a documented tolerance; snapshot < 700 k for several players; `scripts/p5b/build-goods-1900.mjs --check` current. |
| UI | `ui-shell/mobile-shell`, `app-wiring`; Playwright playtest `scripts/p5b/playtest-goods.mjs` at 844 × 390: groups, search, focus, controls ≥ 44 pt, nothing on hover, no console errors. |

**Tests you marked (I will not edit them):**

| Test | P5b effect |
|---|---|
| `economy/land-resources.test.ts` (p5-land) | Its 1900 deposit test should still pass after C-2 (assertions are lower bounds and named deposits). Technique normalisation gains the fertiliser factor. The generator check runs `scripts/p5/build-p5-world.mjs --check`, which must stay current after the authored-deposit additions. |
| `population/demography-causes.test.ts` (p4-demography) | Day-0 rates are unaffected. Multi-month 1900-world tests run on a changed economy. |
| `economy/scenario-feasibility.test.ts` (m5-feasibility) and `population/calibration.test.ts` (m2-calibration) | Use legacy definitions and must stay bit-identical. |

If any of them fails because of P5b, I stop and report it with the cause, rather than change it.

---

## 10. Contradictions and proposed resolutions

- **C-1 Technology knowledge in 1900 (D8).** Only the USA, GBR, DEU, FRA, NLD, BEL and CHE know steelmaking, electrical generation and chemical fertilizer in the 1900 data. But Russia, Austria-Hungary, Sweden, Italy, Spain and Canada made steel, and many more countries generated electricity.
  - **Proposal:** a country with sourced 1900 output of a gated good starts knowing its gate. This is a data change to `p5/countries_1900.json`.
  - Their sector bonuses then enter the technique solve, so day-0 value added is unchanged.
- **C-2 Deposits missing for sourced producers.** The 1900 deposits have no discovered deposit for several sourced producers: Spanish iron (Biscay) and copper (Huelva), British home iron (Cleveland), Luxembourg iron, Russian gold, German copper and silver, among others.
  - **Proposal:** add authored, cited deposit rows to `p5/deposits_authored_1900.json` (P5a data under review) and regenerate the P5a outputs.
- **C-3 Non-storable goods versus D-136 (D3).** Producers buy inputs only from opening stock, so a good with no stock can never be a producer input.
  - **Option A (recommended):** production waves with same-day allocation (§4.4).
  - **Option B:** electricity and services go to households only in P5b. The aluminium recipe would then need captive coal power, and electrified industry would wait for P6.
- **C-4 Sourced output versus modelled demand (D4).** Placing production at sourced quantities while demand is a stand-in sends unbought goods to the price floor, the D-136 lesson.
  - **Proposal:** location from sourced shares, level from modelled demand, with the ratio reported.
- **C-5 Capital goods have no buyer (D5).** Upkeep is paid to the system reserve, a sink.
  - **Proposal:** maintenance inputs, sized to the money upkeep they replace.
- **C-6 Service units.** The proposal's principle 2 says a service unit is valued at its 1990 price. Principle 4 says goods that existed in 1900 take 1900 prices.
  - **Proposal:** a service unit is 1 RUSD of service at 1900 US prices.
- **C-7 Price band.** The band 0.25–4 × reference cannot follow real price falls larger than 4×: electricity, aluminium, electronics and computers.
  - **Proposal:** keep it in P5b and flag it for P6 and P15.
  - `basePrice1900RUSD` keeps its name and is documented as the reference price.
- **C-8 Joint cotton and crop bands.** Cotton is a fixed 4 % joint product of grain on every commercial farm (a known D-135 distortion).
  - **Proposal:** a separate cotton farm in the cotton band.
  - Wool stays joint with meat.
- **C-9 Fertiliser in the P5a production function.** Adding it changes the P5a function. The optional-input form keeps day 0 unchanged.
- **C-10 Motor vehicles.** About 9,000 vehicles were made in 1900, but no country knows internal combustion.
  - **Proposal:** a later good with its 1990 price; no 1900 output (negligible value).
- **C-11 Gold and silver (D6).** Most 1900 gold went to coinage and reserves.
  - **Proposal:** mines sized to non-monetary demand (jewellery, arts, photography); the monetary share is reported as uncovered until D-140.
- **C-12 Hydro (D7).** The dataset licence is not confirmed.
  - **Proposal:** hydro stations only in provinces with an authored 1900 hydro plant for now.
  - With the licence confirmed, province hydro potential becomes a non-depleting capacity cap.
  - Switzerland and Norway's 1900 power depends on it.
- **C-13 Aircraft unit.** "Aircraft-eq." is undefined; it becomes 1 t of airframe empty weight.
- **C-14 Timber.** Timber is a depleting deposit, and regrowth is not modelled. Stocks last centuries at 1900 rates; regrowth is for later.
- **C-15 Gas.** Gas is local without pipelines, so it cannot be traded until the shipper knows *pipelines*.
- **C-16 E4 sectors.** Adding `mining`, `energy` and `services` changes the industrial-policy state (schema 33) and its screen.
- **C-17 BLS budget.** The 1901 budget includes rent. Rent is excluded until P6 housing.
- **C-18 Existing keys.** `livestock` and `food-products` keep their keys; only their names change.
- **C-19 Warehouses.** One capacity per level for all goods would let a grain-sized warehouse hold limitless gold.
  - **Proposal:** per-good capacity per level scaled by the good's 1900 daily world output.
- **C-20 Commerce and transport.** These are margins in reality. In P5b they are household need items, a stand-in that P6 (expenditure system) and P8 (transport wedge) replace.
- **C-21 Need gating.** Gating by the consumer's own country alone would block imports.
  - **Proposal:** the country knows the technology, or the good is in stock in the market.
- **C-22 Data version.** The proposal named `m3-economy-v13` for the technologies. It also covers the goods, buildings and needs.

---

## 11. Phone UI plan

The phone in landscape (844 × 390) is the design target. Colour, type and layout come from `design/tokens.ts`. Every control is at least 44 pt, and nothing depends on hover. Web, iOS and Android share one code path.

1. **Markets screen.**
   - The home-market card gets a search field on top (the `TextInput` pattern of `CountrySelectionScreen`, 44 pt high) and a horizontally scrolling row of group chips (8 headings plus "All").
   - Folded group sections follow. Each row shows the good, its price in the display currency (P3 formatter), stock and capacity per day.
   - Goods not traded in the market collapse into "N not traded here". Unknown goods show their unlocking technology on tap.
   - Opening another market's card sends `SET_MARKET_FOCUS`; its prices arrive with the next snapshot, behind a short "loading prices" line.
2. **Production view.** The Country screen's "Production capacity by good" (today the first 8) becomes the same grouped, searchable list over all goods, with an extraction line for mined goods (this month's extraction, remaining known stock).
3. **Construction screen.** Project types are grouped by sector, with search. A locked type shows its technology. A mine type shows the province's known deposits.
4. **Province panel.** Known deposits show the mines working them and the share already extracted.
5. **Verification.**
   - `pnpm -F @century/app export:web`, then `scripts/p5b/playtest-goods.mjs` (Playwright, 844 × 390, plus one tablet size) with screenshots in `docs/images/p5b/`.
   - `pnpm app:export` to confirm the iOS and Android bundles build.
   - No device claims.

---

## 12. Phase 2 steps (one or more commits each; tests first where practical)

| Step | Work |
|---|---|
| 0 | Baseline `perfPhases` and `perfBench 92` on P5a; source fetch audit (§2) |
| 1 | `historical/p5b/sources_1900.json` (prices, outputs, recipes, budget), with the price-trace test |
| 2 | Definitions (57 goods, buildings, needs, two technologies, v13) and their validation tests |
| 3 | Simulation: extraction, non-storable goods and waves, optional input, maintenance, need gating, sectors; schema 33 with save tests |
| 4 | Generator `scripts/p5b/build-goods-1900.mjs` (`--check`): C-1 and C-2 data, placement, levels, technique, needs, warehouses, calibration and before/after report |
| 5 | Performance: measure, profile, optimise, re-verify hashes |
| 6 | Worker snapshot and protocol 22; size tests |
| 6b | Only if D1 or D2 is chosen for P5b |
| 7 | App UI and playtest |
| 8 | DECISIONS (D-146 onward), provenance `docs/P5B_GOODS_PROVENANCE.md`, program and GDD status lines, `P5B_COMPLETION_REPORT.md` |

`pnpm test`, `pnpm typecheck` and `pnpm bench` run after steps 3, 4, 5, 6 and 7. Files are LF. Commits go to `prosperity/p5-land` only; nothing is pushed. The 1900 map rebuild scripts (`build-boundaries.mjs`, `build-map.mjs`) and the century benchmark are not run. Generated `packages/app/src/generated` and `packages/sim-worker/src/generated` are only rebuilt by their scripts.
