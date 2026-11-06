# P5 — Goods catalogue proposal (1900–2000)

**Status:** approved by the designer on 2026-11-05 with three changes, applied below: tin,
gold and silver are added, consumer electronics is split into radios, televisions,
computers and mobile phones, and refined fuels into kerosene, petrol, and diesel and fuel
oil. **57 goods.** Decision D-143.
**Context:** the designer asked to bring the whole goods catalogue of the game into P5
instead of P6's ~22 goods (`docs/PROSPERITY_PROGRAM.md` §4 P6). GDD §7.1 lists fifteen
v1 goods and names rubber, chemicals, automobiles, electricity, electronics and
pharmaceuticals as later candidates; the build has eight.

## 1. Principles

1. **A good exists if it changes a decision or a story** between 1900 and 2000: a
   resource that makes a province valuable, a chain that can bottleneck, a demand that
   shifts with income, or a technology that changes what a country can make.
   Products that never differ from a sibling in source, chain or demand are merged.
2. **Physical units** wherever possible (kg, t, m³, MWh, units); services use a
   defined service unit valued at its 1990 price.
3. **One catalogue from day 0.** Every good is defined in 1900. A good that nobody can
   make yet has no producer and no demand until a technology unlocks a building that
   makes it; it is never stocked or priced by fiat.
4. **Prices.** Goods traded in 1900 take 1900 US wholesale prices × the CPI factor
   15.704 (the P2b basis). Goods that appear later take their **1990 US producer price,
   which is already RUSD** (D-122: one RUSD is a 1990 dollar).
5. **No pools (GDD §2).** Services are produced by workers in buildings and bought by
   households, firms and the state; they are not abstract capacity.

## 2. Catalogue: 57 goods

Legend for **Available**: `1900` = made somewhere in the 1900 world; a technology name
= produced only once a country knows it (existing tech ids in brackets; *new* = a
technology that does not exist yet).

### 2.1 Food and agriculture (9) — land, harvest variance, own consumption

| # | Good | Unit | Made from / where | Available | Main use |
|---|---|---|---|---|---|
| 1 | Grain *(existing)* | kg | cropland | 1900 | food, feed, food processing |
| 2 | Meat *(existing "livestock")* | kg | pasture, grain feed | 1900 | food (income-elastic) |
| 3 | Dairy and eggs | kg milk-eq. | pasture, grain feed | 1900 | food (income-elastic) |
| 4 | Fish *(existing)* | kg | fisheries | 1900 | food |
| 5 | Fruit and vegetables | kg | cropland | 1900 | food (income-elastic) |
| 6 | Sugar | kg | cane (tropical cropland) or beet | 1900 | food, food processing |
| 7 | Coffee, tea and cocoa | kg | tropical cropland | 1900 | stimulants (colonial trade) |
| 8 | Tobacco | kg | cropland | 1900 | stimulants |
| 9 | Processed food and drink *(existing "food-products")* | kg | grain, sugar, meat, dairy, produce | 1900 | food; canning (8), refrigeration (17) raise its range |

### 2.2 Fibres and forest (5)

| # | Good | Unit | Made from / where | Available | Main use |
|---|---|---|---|---|---|
| 10 | Cotton *(existing)* | kg | cropland | 1900 | textiles |
| 11 | Wool *(existing)* | kg | pasture | 1900 | textiles |
| 12 | Rubber | kg | tropical plantations; synthetic from oil/chemicals | 1900; synthetic: petrochemicals (47) | tyres, vehicles, consumer goods |
| 13 | Timber | m³ | forest stock (deposit) | 1900 | construction, paper, furniture, fuel |
| 14 | Paper | t | timber, chemicals | 1900 | printing, packaging, offices (literacy) |

### 2.3 Mining (11) — deposits, discovery, depletion

| # | Good | Unit | Deposit | Available | Main use |
|---|---|---|---|---|---|
| 15 | Coal | t | coal | 1900 | steel, power, heating, chemicals, railways |
| 16 | Crude oil | t | oil | 1900 | refining |
| 17 | Natural gas | 1,000 m³ | gas (with oil provinces) | 1900 local; pipelines *new* | power, heating, fertiliser, chemicals |
| 18 | Iron ore | t (Fe content) | iron | 1900 | steel |
| 19 | Copper ore | t (Cu content) | copper | 1900 | copper |
| 20 | Bauxite | t | bauxite *(new deposit type)* | 1900 | aluminium |
| 21 | Nitrates | t (N content) | Chilean nitrate *(new deposit type)* | 1900 | fertiliser, explosives (until nitrogen fixation) |
| 22 | Uranium | t | uranium *(new deposit type)* | nuclear power *new* | electricity |
| 23 | Tin | t (metal) | tin | 1900 | tinplate (canning), solder, electronics |
| 24 | Gold | kg | gold | 1900 | jewellery, electronics; monetary use waits for D-140 |
| 25 | Silver | kg | silver | 1900 | jewellery, photography, electronics; monetary use waits for D-140 |

### 2.4 Energy (4)

| # | Good | Unit | Made from | Available | Main use |
|---|---|---|---|---|---|
| 26 | Kerosene | t | crude oil (joint refinery product) | 1900 | lighting, cooking, later jet fuel |
| 27 | Petrol | t | crude oil (joint refinery product) | 1900 | motor vehicles, light aircraft |
| 28 | Diesel and fuel oil | t | crude oil (joint refinery product) | 1900 | ships, heating, power, tractors, trucks |
| 29 | Electricity | MWh | coal, fuels, gas, uranium, or hydro sites | electrical generation (15) | industry, homes, appliances; **not storable**: no stock, cleared daily |

Hydro output needs a **hydro-site potential per province** (a geographic resource like a
deposit; source to be chosen).

### 2.5 Industrial materials (8)

| # | Good | Unit | Made from | Available | Main use |
|---|---|---|---|---|---|
| 30 | Steel | t | iron ore, coal | 1900 | machinery, construction, vehicles, ships, rails, arms |
| 31 | Copper | t | copper ore, coal or electricity | 1900 | electrical equipment, electrification |
| 32 | Aluminium | t | bauxite, electricity | 1900 (tiny) | aircraft, vehicles, packaging |
| 33 | Chemicals | t | coal (coal-tar era), later oil and gas | 1900 | dyes, paper, fertiliser, plastics, pharmaceuticals |
| 34 | Fertiliser | t (nutrient) | nitrates; synthetic from coal/gas | 1900; synthetic: nitrogen fixation (26) | farm yields (P5 production function input) |
| 35 | Plastics | t | chemicals, oil or gas | plastics (31) | consumer goods, electronics, packaging |
| 36 | Construction materials | t | coal, local stone/clay (cement, brick, glass) | 1900 | buildings, housing (P6), infrastructure (P8) |
| 37 | Textiles *(existing)* | kg | cotton, wool; synthetic fibres from chemicals | 1900; synthetic fibres (51) | clothing, household goods |

### 2.6 Capital and transport equipment (7)

| # | Good | Unit | Made from | Available | Main use |
|---|---|---|---|---|---|
| 38 | Machinery | t | steel, copper | 1900 | factories, mechanised farms, mines, railways rolling stock |
| 39 | Electrical equipment | t | copper, steel | electrical generation (15) | power plants, electrified factories, grids |
| 40 | Electronic components | unit-equivalent | chemicals, plastics, copper | transistors (41); integrated circuits (60) | electronics, computers, automation |
| 41 | Motor vehicles | vehicle | steel, rubber, machinery (run on refined fuels) | internal combustion (16) | households, trucking, farms |
| 42 | Aircraft | aircraft-eq. | aluminium, machinery, electronics | air transport (27) | air transport, military |
| 43 | Ships | gross tonne | steel, machinery | 1900 | trade fleets, navies |
| 44 | Armaments | equipment unit | steel, chemicals, machinery | 1900 | M10 military procurement (today paid in money only) |

### 2.7 Consumer manufactures (8)

| # | Good | Unit | Made from | Available | Main use |
|---|---|---|---|---|---|
| 45 | Clothing *(existing)* | garment | textiles | 1900 | clothing need |
| 46 | Household goods | unit-eq. | timber, textiles, steel, plastics | 1900 | furniture, housewares |
| 47 | Household appliances | appliance | steel, electrical equipment, plastics; need electricity | refrigeration (17) | durable demand that rises with income |
| 48 | Radios | device | electrical equipment, later electronic components | radio (23) | media |
| 49 | Televisions | device | electronic components, plastics | television (46) | media |
| 50 | Computers | device | electronic components, plastics | personal computers (80) | households, offices |
| 51 | Mobile phones | device | electronic components, plastics | mobile telephony (81) | communication |
| 52 | Pharmaceuticals | dose-eq. | chemicals | 1900; antibiotics production (53) as method | households and the public-health service (E5) |

### 2.8 Services (5)

| # | Good | Unit | Made by | Available | Main use |
|---|---|---|---|---|---|
| 53 | Commerce | service unit | clerks, labourers in trade establishments | 1900 | margin on household purchases |
| 54 | Transport services | t-km / passenger-km eq. | labourers, vehicles, fuels, ships, aircraft | 1900 | freight wedge (P8), passenger travel |
| 55 | Communication | service unit | clerks, electrical equipment, electronics | 1900 (telegraph) | firms and households; telephones (36), internet (82) |
| 56 | Finance and professional services | service unit | clerks, academics | 1900 | firms, banks (P11) |
| 57 | Personal and recreation services | service unit | labourers, clerks | 1900 | income-elastic household demand |

Health, schooling and administration stay **state services** (E5, M9, M8): they already
have payrolls and causal effects, and a second market good would double-count them.
Housing is a **dwelling stock** with rent (P6), not a good.

## 3. Merged or left out (and why)

- **Rice, wheat, maize** → *grain*: same chain and need; rice-wheat differences are
  yield and region, carried by the province land data.
- **Pig iron, coke** → inside the steel recipe.  **Cement, brick, glass** → *construction materials*.
- **Lead, zinc, nickel** → left out: no distinct chain or decision in this model.
- **Silk, jute, linen** → *textiles* via cotton/wool recipes. **Beverages** → *processed
  food and drink*. **Printed matter** → *paper*.
- **Railway rolling stock** → *machinery*. **Computers** → *consumer electronics* and
  *electronic components* (firms buy through finance and professional services).

## 4. New data this needs

| Need | Proposed source | Note |
|---|---|---|
| 1900 prices of 1900 goods | NBER Macrohistory and the BLS 1900s wholesale-price bulletins (public domain) × 15.704 | as P2b |
| 1990 prices of later goods | BLS PPI and average prices, EIA 1990 energy prices, USGS Mineral Commodity Summaries 1990 | already RUSD |
| 1900 output by country (coal, oil, steel, copper, sugar, coffee, timber, paper, ships, ...) | Energy Institute / Etemad & Luciani historical energy series via OWID; *The Mineral Industry* 1900 (Rothwell, public domain); UK Board of Trade *Statistical Abstract for Foreign Countries* (public domain) | places the 1900 buildings for the new goods; a P2b-sized calibration |
| Tropical and crop suitability | Sourced 1900 production locations, or FAO GAEZ v4 suitability (licence to confirm) | where sugar cane, coffee/tea/cocoa, rubber, cotton can be grown |
| Gas, bauxite, nitrate, uranium deposits | USGS MRDS (bauxite, uranium, nitrate); USGS DDS-60 (gas) | extends the five P5 deposit types to nine |
| Hydro sites | to be chosen (e.g. a published technical hydropower potential by basin) | needed only for hydro electricity |
| New technologies | pipelines, nuclear power, plus the prospecting technologies of the P5 report | content change: data version `m3-economy-v13` |

## 5. Consequences

1. **Scope.** This pulls most of P6 into P5. Proposed split:
   - **P5a** — the approved land, harvest, own-consumption and deposit work, the
     overflow-dust fix, and the save-size fix if approved.
   - **P5b** — the 57-good catalogue: definitions, prices, recipes and buildings,
     extraction from deposits, technology gates, 1900 production of the goods that
     existed, and demand for the new goods through the current need tiers.
   - **P6 keeps** the linear-expenditure (Engel) demand, substitution, saving and
     housing, now on a complete catalogue.
2. **Performance.** Market clearing, demand rows, lot tables and price updates grow
   with the goods a market actually has. Today's market phase covers 8 goods; a 1900
   market would have about 35 of 57 present, more later. Expect a much larger market
   phase than today; it is measured, and optimised where profiling shows, before P5b
   is reported.
3. **Snapshot.** The snapshot is 696,850 characters against the 700,000 bound; per-market
   goods detail (prices, stock) must move to the player's and the focused market only.
4. **Saves.** Lots and prices grow per good and market; measured against main at day
   92 and 366 as for P5a.
5. **Phone UI.** 57 goods need grouping (the eight headings above) in the market and
   production screens, with search; nothing depends on hover.
6. **Calibration.** Adding mines, steel mills and power plants to the 1900 world
   changes every country's value added and employment; the P2b value-added calibration
   is re-run for the covered sectors, and GDP coverage rises.

## 6. Designer decisions

1. ~~The goods list~~ — approved with tin, gold, silver and the two splits (57 goods).
2. ~~Split~~ — approved: P5a then P5b.
3. Whether armaments replace the money-only military equipment in P5b or later.
4. Whether pharmaceuticals feed the E5 public-health service in P5b or later.
