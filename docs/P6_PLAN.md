# P6 plan — Engel demand, saving and housing

**Status:** approved by the designer on 2026-11-08 (Q1–Q16 decided as recorded in §0); implementation in progress. Step 1 of the
assignment (the aluminium unit in the P5b report) is done (`630ddb4`); implementation follows
§12 in order.
**Branch:** `prosperity/p6-demand` (from `main` at `051d7f0`; local commits only).
**Inputs read:** AGENTS.md; `docs/PROSPERITY_PROGRAM.md` (P6, "Carried into P6 from P5b",
stage map); GDD §6.4, §6.5, §6.6, §6.8, §17J; `P5B_COMPLETION_REPORT.md` §11; D-115 to
D-124, D-135, D-136, D-146, D-148 (items 7, 9–13), D-152; `scripts/p5b/build-goods-1900.mjs`
(need tiers, the 1901 budget categories, the food-article split, jewellery, the cloth factor);
`.cache-p5b/PROGRESS.md`; the simulation's household path (`economy/day.ts`
`buildHouseholdDemand`, `population/needs.ts`, `population/wealth.ts`,
`population/demographicLevels.ts`, `economy/politics.ts` `runUnrestPhase`,
`economy/construction.ts`); the Population screen and the province panel.
**New evidence read for this plan:** the 1901 budgets by income class, Table V-C of the
Eighteenth Annual Report of the Commissioner of Labor (already cached for P5b; Appendix A).

Material ambiguities are collected in **§0** with a recommendation each. Contradictions with
the GDD and earlier decisions are in **§10**. None has been settled silently.

---

## 0. Decisions needed from the designer

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **Form of the demand system.** A pure linear expenditure system (LES) has constant marginal budget shares, so as income grows each category's share tends to its marginal share. Fitted to the 1901 US budgets, food's marginal share is 0.31, so a rich country never spends much less than about 31 % of its consumption on food (US 1990: about 15 %). | (a) Pure LES with the 1901 marginal shares; the asymptote is a known limit, left to P15. (b) LES with marginal shares that depend on real supernumerary income, interpolated in log income between two sourced anchors: the 1901 US wage-earner budgets and the 1990 US Consumer Expenditure Survey. At any income the Engel curves are still linear; every anchor set sums to 1, so adding-up holds exactly. | **Decided (designer, 2026-11-08): (b).** The designer asked for a comparison with Victoria 3's pop needs; the refinements it suggests are in §2.5 (Q13–Q16, pending). |
| Q2 | **Subsistence (committed) quantities.** The 1901 Engel curves identify the marginal shares but not the subsistence total: any subsistence total fits the same lines (Appendix A). | (a) Physical committed quantities: food = the existing subsistence basket (1,966 kcal, the P4 food requirement), clothing = the existing basic tier, fuel = a cooking-and-heating minimum, every other category 0. (b) Infer them from an assumed Frisch parameter. | **Decided (designer, 2026-11-08): (a), with the marginal shares as a schedule:** committed quantities are physical; spending above them follows the cumulative marginal-share schedule of Q1b, e_k = p̃γ_k + ∫₀ˢ β_k(x) dx, fitted so that each 1901 income band's spending is reproduced. The 1901 bands themselves show food's marginal share falling from 0.42 to about 0.29 (§2.1), so no single subsistence total has to be chosen. A third, low anchor (a sourced poor-household budget, e.g. Engel's Belgian workers of 1853) sets the shares just above subsistence. Fuel's committed quantity is a cooking minimum only; heating is supernumerary. |
| Q3 | **The farm-gate demand distortion (D-135).** P2b divided retail budget dollars by wholesale reference prices, which overstates physical quantities; this is behind the 12 territories above 100 % of GDP. | (a) Retail margins: every unit a household buys carries sourced quantities of commerce and transport services (as C-20 already does for fuel, lighting and the other non-food categories), so households pay a retail price and the margins are output of the service sectors. Margins scale with the block's urban share (rural households buy near the farm gate). (b) One retail mark-up factor per good with no service output. | **Decided (designer, 2026-11-08): (a)**: causal, adds service value added, and P8's transport wedge can later act on the transport part. |
| Q4 | **Who owns and pays for dwellings before companies (P9) and credit (P11)?** | (a) **Owner-occupied:** each population block owns the dwellings it lives in and buys new ones with its saving from a new *residential builder* building, through the ordinary market. No rent flows in P6; landlords, rent and mortgages arrive with P9–P11. (b) A province stock owned by landlord households, a province rent market (rent price state, rent postings) and a landlord investment rule in P6. | **Decided (designer, 2026-11-08): (a)**: it reuses market clearing, employment and recipes, needs no new account kinds or investment rule ahead of P10, and in 1900 a wage earner's 5 % saving is close to the cost of keeping a dwelling standard (§4.6). (b) is a larger stage that pre-empts P10. |
| Q5 | **Where the stock is held.** The program says "per province". | (a) Per block (province × profession), reported per province; crowding per block feeds that block's mortality. (b) One stock per province with occupancy shared among blocks. | **Decided (designer, 2026-11-08): (a)** with (Q4a): the block is the owner, the funder and the demographic unit. Province figures are exact sums; in 1900 every class of a province starts at its persons per dwelling. |
| Q6 | **The dwelling unit and the crowding measure.** | (a) A *standard dwelling* (one household's dwelling; census-comparable count). Crowding = persons per dwelling ÷ the province's 1900 persons per dwelling, so 1900 is 1.0 everywhere. (b) Floor area (m² per person): almost no 1900 data. | **Decided (designer, 2026-11-08): (a).** Crowding is counted in persons, not adult equivalents (disease passes between people). |
| Q7 | **Crowding's effect on mortality.** | (a) Only crowding above the 1900 level raises mortality; better housing below it acts through sanitation and health as now. (b) Symmetric. | **Decided (designer, 2026-11-08): (a)**: conservative, no double counting with the urban penalty or sanitation. Crowding acts on its own, not through sanitation coverage: sewers did not stop tuberculosis spreading in one-room homes. The unrest term uses the same threshold. |
| Q8 | **Saving.** | (a) Extended LES (Lluch 1973): saving is the share (1 − μ) of supernumerary income, with μ by profession stratum (lower, middle, upper), plus consumption out of financial wealth at a provisional rate λ. Saving stays as household cash (no interest) and pays for dwellings; the rest is idle until P11. (b) A flat saving rate of income by class. | **Decided (designer, 2026-11-08): (a)**: the poor cannot save, saving rises with income inside each class, and the 1901 survey's 5.1 % wage-earner surplus calibrates the lower stratum. With Q15, a windfall above permanent income is saved and a bad harvest is met from cash (buffer stock). λ bounds idle cash: it levels off where λ × cash equals saving less dwelling purchases, so in the long run households spend their income and no hoard grows without limit before P11. |
| Q9 | **Legacy worlds.** About 100 test suites use the tier needs of the M2–M11 fixtures. | (a) Keep the tier path for worlds whose definitions carry no demand system (as P5b kept the legacy goods paths); the 1900 world and new fixtures use the LES. (b) Convert every fixture. | **Decided (designer, 2026-11-08): (a)**: preserves accepted behaviour outside P6's scope and keeps the legacy known answers. |
| Q10 | **Saves.** | (a) D-120: schema-33 saves are listed as incompatible, never deleted. (b) A 33 → 34 load migration: all new state can be derived (dwellings from population and the province's 1900 persons per dwelling, smoothed income from the last day's wages). | **Decided (designer, 2026-11-08): (a)**, as every Prosperity stage so far; (b) on request. |
| Q11 | **Player levers.** | (a) None new in P6: housing and consumption respond to incomes, prices, taxes and welfare that the player already sets. (b) A public-housing E3 project class. | **Decided (designer, 2026-11-08): (a)**; public housing as a later lever (P14 lists the new levers). The residential builder allows state ownership, so E3 public construction can already build it where dwellings are short: an existing lever with a new target. The housing rows on the province panel and the Crowding lens show the player where. |
| Q12 | **The P5b cloth factor** (`TEXTILE_CALIBRATION.clothDemandFactor` 0.52, D-148 item 13). | (a) Remove it: clothing demand comes from the LES at retail prices; re-measure cotton and wool and report. (b) Keep it on top of the LES. | **Decided (designer, 2026-11-08): (a)**; if modelled cotton then leaves 0.85–1.15 of the 1900 crop, the result goes to the designer before any new factor. Only the demand factor goes: the supply-side parts of `TEXTILE_CALIBRATION` (ranch wool 34.4 kg, mill fibre mix, cotton at the 1905 world crop) stay. |

| Q13 | **Food quality ladder** (§2.5): food's composition shifts from grain toward meat, dairy and processed food as income rises (Bennett's law). | (a) Interpolate the within-category weights α between the two anchors, like the marginal shares. (b) Keep fixed α; the shift comes only from the grain-heavy committed basket against the supernumerary mix. | **Decided (designer, 2026-11-08): (a)**, sourced from the 1901 food-article weights and the 1990 survey's food breakdown. |
| Q14 | **Adult equivalents** (§2.5): children need less than adults. | (a) Demand per adult equivalent from the blocks' age arrays, with a sourced 1890s dietary scale (Atwater, USDA; public domain), and the 1901 families re-expressed per adult equivalent with their composition (Table V-A). (b) Per person. | **Decided (designer, 2026-11-08): (a).** |
| Q15 | **Inertia** (§2.5): daily prices and wages move; spending patterns should not jump with them. | (a) The LES reads income smoothed over a year (permanent income) and category prices smoothed over 30 days; no cap needed. (b) 30-day income, current prices. | **Decided (designer, 2026-11-08): (a).** |
| Q16 | **National tastes** (§2.5): tea in Britain, coffee in the United States, no beef demand among Hindus. | (a) Country-specific α within a category where a sourced 1900 per-capita consumption table exists; elsewhere the US weights. (b) One set of weights everywhere (P15). | **Decided (designer, 2026-11-08): (a)** for coffee, tea and cocoa, sugar and alcohol, where per-capita tables exist; it also bears on the coffee-tea-cocoa calibration. |

Also for the designer, not blocking: the performance hold (§9.4) and the order of steps (§12).

---

## 1. Scope and what P6 replaces

P6 (program §4, GDD §17J.3) delivers:

1. **Demand:** a linear expenditure system across need categories (committed quantities
   plus income-elastic marginal shares), with price substitution inside categories. It
   replaces the fixed per-capita tier quantities and the wealth thresholds that switch tiers
   on (comfort at wealth 25, luxury at 60).
2. **Saving:** a household saving rate by class.
3. **Housing:** a physical dwelling stock, built through construction (construction
   materials, timber, labour) and depreciated; crowding feeds mortality (P4 causes) and
   unrest.
4. **Acceptance:** food share falls with income (property test); substitution moves demand
   toward the cheaper good; housing conserved through construction and depreciation;
   determinism; save round trip.
5. **Carry-overs** from P5b §11 resolved or explicitly deferred (§6).

The goods catalogue itself was built in P5b (59 goods). P6 adds one good (*dwelling*) and one
building (*residential builder*) under Q4a.

**Unchanged:** market clearing and its priority tiers, settlement, wages (P7), the wealth
indicator's formula (GDD §6.5), the P4 demographic causes other than crowding, migration
(P7 adds housing pull), trade, money.

---

## 2. The demand system

### 2.1 Form (per block, per day)

Notation: block *b* with population *N*, in market *m*; good *g* in category *k(g)*;
retail price p̃_g (§2.4) in RUSD per unit.

1. **Full income** y (RUSD per person per day) =
   - smoothed cash income: wages, welfare, distributed profits, public payroll and military
     pay received, less income tax (a new per-block state, exponentially smoothed over
     `INCOME_SMOOTHING_DAYS`, provisional 30, because wages arrive daily and profits
     monthly); plus
   - the value at market prices of the food the block kept from its own farms (P5a); plus
   - consumption out of wealth: λ × max(0, household cash − reserve) ÷ N, with λ provisional
     0.04 a year ÷ days in year (life-cycle propensities to consume out of wealth of 0.03–0.06)
     and a reserve of `CASH_RESERVE_DAYS` (provisional 30) of committed spending. This is what
     lets a block with cash but no wage (uncovered clerks and capitalists) keep consuming, as
     it does today.
2. **Committed cost** c = Σ_g p̃_g γ_g, with γ_g the committed quantity per person per day (Q2).
3. **Supernumerary income** s = y − c.
4. **Spending on good g:** e_g = p̃_g γ_g + μ · B_k(g)(s) · w_g(p̃), for s ≥ 0, where
   B_k(s) = ∫₀ˢ β_k(x) dx is the category's cumulative supernumerary spending (Q1b, Q2;
   under constant β it is β_k · s, the pure LES). Pooling the 1901 classes into four bands
   gives these marginal shares between bands: food 0.42 → 0.28 → 0.31; sundries 0.18 → 0.33 →
   0.34; clothing 0.17–0.18; rent 0.18 → 0.14; fuel and light 0.02–0.04. In this formula:
   - μ is the stratum's marginal propensity to consume (Q8; 1 − μ is saved);
   - β_k is category k's marginal budget share (Σ_k β_k = 1; constant under Q1a, a function of
     real supernumerary income under Q1b);
   - w_g is good g's share of its category's supernumerary spending, a CES share:
     w_g = α_g (p̃_g / p̃_g⁰)^(1−σ_k) / Σ_{h∈k} α_h (p̃_h / p̃_h⁰)^(1−σ_k), with α_g the good's
     share of the category at reference prices p̃⁰ and σ_k the category's elasticity of
     substitution (§2.3). Goods whose technology gate is closed (P5b C-21) drop out and the
     shares renormalise.
5. **Saving** = (1 − μ) · s · N.
6. **Below subsistence** (s < 0): the block buys its committed quantities from cash,
   dissaving, at most its cash; nothing supernumerary. If cash cannot pay them, committed
   quantities are funded proportionally (today's rule for an unfunded tier).
7. **Quantities:** q_g = e_g ÷ p̃_g. Buying q_g of a good also buys its retail margin
   services (§2.4); the payment is q_g × p̃_g in total.

**Adding-up:** Σ_g e_g + saving = y·N exactly for s ≥ 0 (Σ β = 1, Σ w = 1 within a category);
tested to a documented relative tolerance.

**Market priority** (unchanged tiers 1/3/6): committed food rows go at tier 1, other committed
rows at tier 3, supernumerary rows at tier 6, dwellings (§4) in a new lowest-priority tier. Scarcity still serves
subsistence first and shares proportionally within a tier.

**The wealth indicator** keeps its GDD §6.5 formula; its subsistence basket is the committed
food basket (unchanged quantities), so wealth, fertility's income term and militancy keep
their meaning. Wealth no longer switches demand on or off.

**Unmet needs:** "unmet subsistence" = committed food not fulfilled (as today's subsistence
tier); "unmet basic" = committed non-food not fulfilled. The P4 food sufficiency keeps
counting kilocalories from all food eaten.

### 2.2 Categories and the P5b goods

The categories follow the 1901 budget's headings (Appendix A) so that every marginal share
traces to a source row. Committed quantities (Q2a) come from the existing tiers.

| Category | Goods (P5b keys) | Committed γ (per person per day) | Marginal share source | σ (provisional) |
|---|---|---|---|---|
| Food | grain, livestock, fish, dairy, produce, sugar, coffee-tea-cocoa, food-products | the subsistence tier: grain 0.527 kg, livestock 0.03 kg, fish 0.03 kg, food-products 0.03 kg (1,966 kcal) | 1901 Table V-C food | 1.5 |
| Clothing | clothing, textiles, (silk via the mill) | the basic tier (0.01 garments in P2b; 0.0052 after the P5b cloth factor), re-derived at retail prices under Q12a | 1901 Table V-C clothing | 1.2 |
| Fuel and light | coal, timber, kerosene, natural-gas (gated by pipelines), electricity (gated), fuel-oil | a cooking minimum, from the 1901 fuel intercept (Appendix A), provisional | 1901 Table V-C fuel + lighting | 2.0 |
| Household goods | household-goods, appliances, radios, televisions, computers, mobile-phones (each gated by its technology) | 0 | 1901 Table IV-R furniture and utensils, within sundries | 2.0 |
| Drink and tobacco | tobacco, food-products (liquor share of D-148's mapping) | 0 | IV-R liquors, tobacco | 1.0 |
| Health | pharmaceuticals, personal-services (medical share) | 0 | IV-R sickness and death | 0.5 |
| Transport | transport-services, motor-vehicles and petrol (gated) | 0 | IV-R other purposes (share) | 1.5 |
| Other services | communication, finance-services, personal-services, paper (books and newspapers), jewellery | 0 | IV-R books, amusements, insurance, other | 1.5 |

- **Within sundries** the 1901 Table V-C has one column; Table IV-R (2,567 families, already
  transcribed in `sources_1900.json` `budget1901`) splits it into items but not by income
  class. Under Q1a the sundry categories share sundries' marginal share in proportion to
  their IV-R averages (provisional); under Q1b the 1990 survey supplies the high-income
  anchor for each.
- **α_g inside a category** = each good's share of the category at reference prices, from the
  current tier items (the 1901 food-article weights for food, D-148 item 7; the C-20 category
  mixes for the rest), so 1900 spending patterns inside a category are kept.
- **Later goods** (motor vehicles, appliances, radios, televisions, computers, mobile phones,
  petrol) have no household demand today. Placing them in categories behind their technology
  gates gives them demand when a country learns them (no 1900 effect).
- **Retail margins** move out of the categories: commerce and transport-services are bought
  as margins on goods (§2.4) and, beyond that, as transport and other services.

### 2.3 Substitution inside categories

The CES shares w_g carry the price substitution: when a good becomes cheaper relative to
its category, its quantity rises for any σ > 0 and its spending share rises if σ > 1. The
committed basket is physical and does not substitute (Q2a), so a block at subsistence buys the
same calories whatever the prices; substitution acts on supernumerary spending. σ values are
provisional (cross-sectional food-group elasticities of substitution are mostly between 0.5
and 2); a later revision could let staples substitute by kilocalorie cost.

### 2.4 Retail prices and margins (Q3a, the farm-gate fix)

p̃_g = p_g + u · (m_g^c · p_commerce + m_g^t · p_transport), where p_g is the market price, u
the block's urban share (P4 state; rural households buy near the farm gate) and m_g^c, m_g^t the
commerce and transport service units per unit of g bought by an urban household.

- **Food margins** from the same 1903 report: Part II, retail prices of food in 1901, against
  the 1900 wholesale prices already transcribed (BLS Bulletin 39, NY prices; `sources_1900.json`
  `prices1900`). Retail ÷ wholesale − 1 for flour, meat, fish, butter, milk, eggs, sugar,
  coffee, tea and potatoes gives the margin per food group, split between commerce and
  transport by the C-20 shares (provisional).
- **Non-food margins** keep the C-20 category mixes already in `build-goods-1900.mjs`
  (`CATEGORY_GOODS`), expressed per unit.
- Effect: the physical quantity per retail dollar falls (P2b's wholesale divisor goes), the
  service sectors gain the margin's value added, and the household's spending is unchanged.

### 2.5 Comparison with Victoria 3 (designer's request on Q1)

Read on 2026-11-08 from the community wiki (Needs and Pops pages, last checked by their
editors against versions 1.10–1.13) and search excerpts of developer diary 13; the diaries
themselves were behind a browser check. Mechanisms only; no game data is used.

**How it works there.**
- Each wealth level (1 to 60+) has a *buy package*: an amount of money at base prices per
  need category, per 10,000 working adults, with dependants counted as half an adult.
- Categories form a ladder. Basic food, simple clothing and crude items rise, peak and then
  vanish at higher wealth, replaced by luxury food, standard clothing and household items.
  Services, leisure, luxury items and similar needs grow faster and faster with wealth. So the
  food share falls by construction of the curves.
- Wealth is a slow state variable: it rises while income exceeds the package's cost and falls
  otherwise, drifting to the consumption a pop can sustain. Standard of living (wealth plus
  modifiers) drives birth and death rates and loyalty. Pops below an *expected* standard of
  living, which rises with literacy, grow radical.
- Inside a need, goods are shared by fixed weights, with minimum and maximum shares, weekly
  change caps and cultural *obsessions* and *taboos*. The shares follow each good's share of
  market supply, not its price: pops never look at prices. Players have long complained about
  this substitution.

**What the P6 design already does differently, and why.**
- *Sourced Engel curves, not designed ones.* Q1b gets the falling food share from the 1901 and
  1990 budgets instead of authored per-level curves.
- *Price substitution.* CES shares respond to relative prices (§2.3), which the acceptance
  test requires; supply-share substitution would not pass it.
- *Physical food.* Committed quantities are kilocalories (P4), not money at base prices; and
  farm households keep their own food explicitly (P5a), where Victoria 3 lets peasants buy a
  small fraction of the package.
- *Bennett's law in part.* The grain-heavy committed basket against the meat- and dairy-heavy
  supernumerary mix already moves the diet up the ladder as income rises.

**What is worth taking (Q13–Q16 in §0, pending).**
- **Q13, a food ladder:** let the within-category weights move with income between the two
  anchors, so the diet shifts toward meat, dairy and processed food, as its basic-to-luxury
  food ladder does, but sourced.
- **Q14, adult equivalents:** count children at a sourced dietary scale; the blocks already
  carry age arrays.
- **Q15, inertia:** its slow wealth drift keeps consumption steady. Here, permanent (one-year
  smoothed) income and 30-day smoothed category prices do the same job without a cap.
- **Q16, national tastes:** its obsessions and taboos, but only where a 1900 per-capita
  consumption table supports them (coffee against tea, sugar, alcohol). No authored culture
  modifiers.
- **Later, not P6:** its expected standard of living, unrest from consumption below a
  reference that rises with literacy, fits P14's story layer, beside P6's crowding term.

---

## 3. Saving

- **Rule (Q8a):** saving = (1 − μ_stratum) × supernumerary income; dissaving only to pay
  committed quantities (§2.1, 6) and through λ. Strata are the professions' existing
  `stratum` (lower: peasants, labourers; middle: clerks, academics; upper: capitalists).
- **Lower stratum, sourced:** the 1901 survey's 11,156 normal families spent 94.90 % of income
  (surplus 5.10 %, text p. 96, PDF 97). At their mean income (617.80 / 0.949 = 651 USD a
  family) and the committed cost of Q2a, μ_lower = 1 − 0.051 × 651 ÷ (651 − c). A sharper fit
  uses the surplus by income class (Table V-A/V-B income by class, same report; to transcribe).
- **Middle and upper, provisional:** calibrated so that the United States' aggregate 1900
  personal saving rate matches the *Historical Statistics of the United States* (Colonial
  Times to 1970) personal-saving series (to transcribe), with μ_middle between the two
  strata. Peasants take μ_lower (no 1900 source; their saving is largely in kind and land,
  outside the model).
- **Where saving goes before P11:** it stays in household cash (no interest, no deposits, no
  lending) and pays for new dwellings (§4). What is not spent on dwellings is idle saving, a
  stock reported on the Population screen. P11 turns it into deposits and loans; P10 into
  company investment.
- **Effect on today's behaviour:** today a block spends cash up to its active tiers and keeps
  the rest, so a rich block's saving is whatever its tiers leave. Under the LES rich blocks
  spend μ of their supernumerary income, which raises demand for manufactures and services.

---

## 4. Housing

### 4.1 State (schema 34)

- `PopBlock.dwellings`: standard dwellings the block owns and lives in (real, ≥ 0; like goods
  quantities, with conservation checked to a documented relative tolerance). Integer
  dwellings with a remainder are possible; real values match how dwellings are bought in the
  market.
- `PopBlock.incomeSmoothedRUSDPerCapitaDay` (§2.1).
- `ProvinceEconomy.housingReferencePersonsPerDwelling`: the province's 1900 persons per
  dwelling (fixed data, encoded like `hydroPotentialMWhPerYear`).
- `ProvinceEconomy.housingReferenceIncomeRUSDPerCapitaDay`: the province's 1900 mean full
  income (fixed, written by the generator), so that 1900 is a housing equilibrium.
- Cumulative counters for the report: dwellings bought and depreciated, by block (or monthly
  history in the existing bounded history), so conservation is checkable from state.

### 4.2 1900 initial conditions

Dwellings of block b = N_b ÷ the province's 1900 persons per dwelling (crowding 1.0).

- **Sourced** where a 1900–1901 census counts dwellings or inhabited houses and persons:
  the United States (Twelfth Census, 1900: dwellings and families by state), England and
  Wales, Scotland and Ireland (1901 censuses, inhabited houses), the German Empire (1900),
  France (1901, maisons and ménages), British India (1901, occupied houses), Japan and others
  where found (candidates in §5).
- **Estimated** elsewhere from the nearest sourced country of the same region and urban
  share, marked provisional with the proxy recorded (as D-135 A8).
- Province values inside a country: the country value adjusted by the province's urban share
  where the census separates towns (provisional); otherwise the country value.

### 4.3 Construction: the dwelling good and the residential builder (Q4a)

- **Good 59, `dwelling`:** one standard dwelling; storable (a builder's unsold houses);
  **not tradeable** (built where bought); no spoilage in stock; group *capital equipment*.
  Reference price = the 1900 US cost of a new standard dwelling (source to transcribe, §5),
  × 15.704.
- **Building `residential-builder`** (construction sector, labourers and a clerk share):
  recipe per dwelling = timber, construction materials and steel at the 1900 materials
  composition of a frame-and-brick workman's dwelling (to source; provisional split e.g.
  lumber about half of materials), sized by the D-135 A3 rule like every P5b building.
- **Purchases:** a block's dwelling demand row is funded from cash above its reserve, after
  consumption, at the lowest priority. A fulfilled purchase moves the dwellings from the
  builder's stock to the block's `dwellings` in the same settlement, with an ordinary market
  purchase posting (household cash → builder operating cash). No new account kind.
- **Desired stock:** D*_b = N_b ÷ h0_p × (y_b ÷ y0_p)^ε_h, where h0_p and y0_p are the
  province references (§4.1) and ε_h the income elasticity of dwellings per person,
  provisional 0.37 (US persons per household about 4.60 in 1900 and 2.63 in 1990 while real
  GDP per head rose about 4.6 times: ln 1.75 ÷ ln 4.6; both figures from memory, to be
  transcribed from the Census Bureau series and MPD 2023 before use). In 1900 D* = D for
  every block.
- **Orders:** each day max(0, D* − D) ÷ (`HOUSING_ADJUSTMENT_DAYS`, provisional 365) dwellings,
  bounded by the cash above the reserve. Depreciation and population growth open the gap, so
  the 1900 flow is replacement plus growth.

### 4.4 Depreciation

D_b ← D_b × (1 − δ ÷ days in year) each day; δ from the United States' 1890 and 1900 census
dwelling counts and the 1900 new-dwelling starts (*Historical Statistics*, series N 156;
about 189,000 non-farm units in 1900 from memory, to be verified), δ = (starts − Δ stock) ÷
stock; BEA's depreciation rate for one-to-four-unit residential structures (about 1.1 % a
year, to be verified) as a cross-check. If the 1890s stock grew mostly by new building, δ is
well below 1 %; it is calibrated from the transcribed counts, not assumed.

**Conservation (acceptance):** for every block, province and the world,
D_end = D_start + bought − depreciated, and a province transfer moves its blocks' dwellings
with them; migration leaves dwellings with the source block (migrants crowd the destination
until it builds, a causal effect P7 can use).

### 4.5 Crowding, mortality and unrest

- **Crowding** c_b = (N_b ÷ D_b) ÷ h0_p; 1.0 in 1900. Model domain: c is bounded at
  `CROWDING_MAX` (provisional 3) for a block with almost no dwellings (a new block in P7);
  documented as a domain, not a repair.
- **Mortality (Q7a):** child and adult levels gain a factor 1 + K × max(0, c − 1), with K
  provisional (child 0.5, adult 0.3), from 1900–1901 evidence of death rates by dwelling size
  (Registrar-General and medical officers' reports, e.g. Glasgow by number of rooms; to
  source). The factor is 1 in 1900, so the P4 residuals and the sourced 1900 levels are
  unchanged; a dedicated fixture varies crowding alone.
- **Unrest:** the province target gains + `UNREST_CROWDING_WEIGHT` (provisional 0.1) ×
  max(0, c̄ − 1), with c̄ the population-weighted crowding of the province.

### 4.6 Why owner-occupation fits 1900 (Q4a)

A US standard dwelling of roughly 1,500 USD for 5.3 persons is about 283 USD a person.
Replacement plus 1.9 % a year of population growth (δ + g ≈ 2 %) costs about 5.7 USD a person a
year, 4.6 % of a wage earner's 123 USD a person: close to the 1901 surplus of 5.1 %. So
the lower stratum's sourced saving roughly pays for keeping its housing standard, without
inventing rent or landlords before P9–P11. (Figures to be replaced by the transcribed price
and δ.)

**Not modelled in P6:** rent and imputed rent as household spending (the 1901 rent share is
taken out of the LES; §5), housing services as value added (about a tenth of 1900 GDP, so
coverage excludes it), landlords, mortgages, land prices.

---

## 5. Sources and parameter status

All public domain unless noted; each will be a P6 source row with licence and attribution,
printed in a generated `docs/P6_DEMAND_PROVENANCE.md`. Downloads go to one new empty folder
each under `.cache-p6/` (git-ignored first); a source that restricts commercial use stops the
work and comes to the designer. HathiTrust and other script-blocking hosts: I ask the designer
to download.

| Parameter | Source | Status after P6 |
|---|---|---|
| Marginal shares (food, clothing, fuel and light, sundries; rent removed) | Commissioner of Labor 1903, Table V-C, p. 558 (PDF 699), 11,156 normal families by income class: **already read** (Appendix A) | sourced |
| Sundry split | same report, Table IV-R, pp. 508–509 (`budget1901`, already in `sources_1900.json`) | sourced (split provisional under Q1a) |
| 1990 anchor (Q1b) | BLS Consumer Expenditure Survey 1990, shares by income quintile (US government, public domain) | sourced if Q1b |
| Committed quantities | the P2b subsistence and basic tiers (existing rows) | sourced as today |
| Food retail margins | same report, Part II, retail prices of food 1901; BLS Bulletin 39 wholesale (cached) | sourced |
| μ lower stratum | same report, text p. 96 (5.10 % surplus); Tables V-A/V-B by income class | sourced |
| μ middle, upper | *Historical Statistics of the United States*, personal saving series (US government) | calibrated to one aggregate, provisional split |
| λ, reserve days | literature range | provisional |
| Persons per dwelling 1900 | Twelfth Census 1900; censuses of England and Wales, Scotland, Ireland 1901; Statistik des Deutschen Reichs 1900; Résultats statistiques du recensement 1901 (France); Census of India 1901; others as found | sourced where a census exists, otherwise estimated with proxy |
| Dwelling price and materials | 1900 US cost of a new dwelling (*Historical Statistics* construction series, Commissioner of Labor special reports on workmen's housing) | sourced or provisional |
| δ | US census dwellings 1890 and 1900 and starts 1900 (*Historical Statistics* N 156); BEA depreciation rates (cross-check) | calibrated |
| ε_h | Census Bureau persons per household 1900 and 1990; real income per head (MPD 2023, already used in P2b) | calibrated, provisional |
| Crowding coefficients | 1900–1901 mortality by dwelling size (Registrar-General, medical officers' reports) | provisional |
| Cross-country Engel check | UK Board of Trade budgets by income group (1904 inquiry and the 1908–1911 international series; Crown copyright expired) | report only |

Rent: the 1901 families spent 18.1 % on rent (marginal share 0.16). Under Q4a no rent is
paid, so the consumption categories' marginal shares are re-normalised over non-rent spending
(each ÷ 0.8375). Households in the model have the same income, so the money that paid
landlords in 1901 is spent or saved by the household instead; the generator places production
for that demand, and the report states it.

---

## 6. Effect on the 1900 calibration and the P5b carry-overs

The generator (`scripts/p6/build-demand-1900.mjs`, chained after `build-goods-1900.mjs`, with
`--check`) recomputes household demand by the LES at each block's 1900 full income and opening
prices, adds housing investment demand, and re-runs the P5b placement (D-146 A5: world levels
from modelled demand, shares from sourced output). Expected effects, all to be measured and
reported in a generated `docs/P6_BEFORE_AFTER.md`:

| Carry-over (P5b §11) | P6 treatment | Expected |
|---|---|---|
| Household quantities from the 1901 US budget at reference prices; coffee-tea-cocoa 2.36× | **Resolved structurally:** quantities = spending at retail prices from each block's own income; the US budget sets shares, not quantities | coffee-tea-cocoa toward 1×; to report |
| Clothing scaled once by 0.52 | **Removed (Q12a)**; clothing from the LES | cotton re-measured; designer decides if outside 0.85–1.15 |
| P2b farm-gate demand distortion; 12 territories above 100 % of GDP | **Resolved by Q3a** (retail margins) and by income-bound demand: household spending cannot exceed income | fewer territories above 100 %; any left are export-crop placements (sourced shares), reported |
| Residual cap (plan §8) | kept as the workforce safety rule; reported | binds less |
| Construction demand for housing; steel 0.25, construction materials far below 1900 | **Partly resolved:** dwellings add timber, construction materials and some steel | construction materials and timber up; steel stays low — most 1900 steel went to railways, ships and plant: **deferred to P8 (infrastructure) and P10 (investment)** |
| Covered value added 40.7 % of world GDP | demand now equals income, margins add services, builders add construction | well above 40.7 %; not 100 %, because government services, non-housing investment and housing services stay outside coverage |
| Rubber 0.42×; gold 0.48, silver 0.18 | not household items | **deferred:** rubber to P8 (tyres, cables); gold and silver to P11 (D-152) |
| Iron ore, copper, tin, bauxite, nitrates low | intermediate demand | **deferred** to P8/P10 with steel |

**1900 consistency checks** (tests): every block's opening spending ≤ its full income; the
budget identity holds on day 1; food share by country falls with income (British India above
the United States); D* = D at opening.

---

## 7. Schema, saves, protocol and data versions

- **World schema 33 → 34; simulation 0.29.0 → 0.30.0; data `m3-economy-v13` → v14; worker
  protocol 22 → 23.**
- **State:** §4.1 fields; the demand-system definitions (categories, γ, β or the two anchor
  sets, μ by stratum, σ, α, margins, λ, ε_h, δ, crowding coefficients) are validated
  definitions, not state; tuning coefficients live in `population/constants.ts` /
  `economy/constants.ts` with units, justification and status; content (γ, α, margins,
  census references) in data files.
- **Serialization:** the new block and province fields in the save's column tables (every
  province carries the housing references or none, as with hydro, P5b §7.5).
- **Saves (Q10a):** schema-33 saves listed as incompatible with the reason (D-120); never
  deleted or overwritten.
- **Validation:** non-negative finite dwellings and income; conservation of dwellings
  through the day; no NaN; references positive where population is positive; demand-system
  definitions (Σ β = 1, α sum to 1 per category, σ > 0, γ ≥ 0, μ in (0, 1]).

---

## 8. Phone UI (protocol 23)

Reference 844 × 390 points, landscape, 44-point controls, no hover, colours, type and layout
only from `packages/app/src/design/tokens.ts`; the map stays mounted; panels slide over it.
Same code path on web, iOS and Android.

1. **Population screen, new "Households" section** (country):
   - spending shares by category (food share first), with a one-line source note;
   - saving rate by stratum (lower, middle, upper) and idle household saving (stock);
   - housing: dwellings, persons per dwelling, crowding against 1900, dwellings bought this
     month;
   - the existing "unmet subsistence / basic" rows keep their meaning (committed quantities).
   Compact rows using the existing `StatRow` and `Disclosure` components; no new chart.
2. **Province panel:** housing rows (dwellings, persons per dwelling, crowding, bought this
   year) and the province's food share.
3. **Map lens "Crowding"** (persons per dwelling ÷ 1900), using the existing province-lens
   path; a lens chip at 44 points like the current ones.
4. **Markets screen:** the dwelling good appears under capital equipment automatically.
5. **Snapshot:** a compact per-province array (crowding and dwellings) plus country
   aggregates; estimated +25–35 k characters against about 494 k (bound 700 k).
6. **Playtest** (`scripts/p5b/playtest-goods.mjs`, extended or a P6 copy): the Households
   section renders with figures, the province panel shows housing, the Crowding lens selects
   and colours the map, 60 goods counted; no console errors, exceptions or failed loads at
   844 × 390.

---

## 9. Tests

Tests first where practical; every new coefficient has a unit-level test of its formula.

1. **Demand unit tests** (`economy/demand-system.test.ts`): adding-up; committed quantities
   bought first; below-subsistence dissaving capped by cash; gated goods renormalise;
   homogeneity (prices and income × k leave quantities unchanged).
2. **Property test, food share falls with income** (acceptance): over a deterministic grid of
   incomes and prices (no `Math.random`; a keyed draw from `rng.ts` with a stable purpose id if
   sampling is used), the food share is strictly decreasing in income above subsistence, for
   every stratum and market price set in the 1900 world.
3. **Substitution** (acceptance): in a two-good category fixture and in a market fixture,
   lowering one good's price raises its quantity relative to the other's; the category total
   follows the LES.
4. **Saving:** saving rate rises with income inside a stratum; upper > middle > lower at equal
   supernumerary share; cash never negative; λ drawdown bounded by cash above the reserve.
5. **Housing conservation** (acceptance): over N days of a fixture and of the 1900 world,
   bought − depreciated = Δ dwellings for every block, province and the world; province
   transfer moves dwellings; migration leaves them; rollback restores them.
6. **Crowding causes:** a fixture varying crowding alone raises child and adult mortality by
   the documented factor; 1900 effective levels are unchanged (calibration); unrest target
   rises with crowding.
7. **Determinism and replay:** identical hashes for two runs and for replay through the
   rollback runner; the 1900-world hash re-pinned by design with the reason in the test.
8. **Save round trip** (acceptance): schema 34 encode → decode → identical hash, including
   dwellings and smoothed income; schema 33 rejected with the D-120 message.
9. **Generator:** `--check`; every demand parameter traces to a source row or is marked
   provisional (like `p2b-money`); the 1900 checks of §6.
10. **Legacy path (Q9a):** existing M2–P5b suites pass unchanged (legacy known answers kept).
11. **Worker and UI:** protocol 23 snapshot fields; snapshot bound; playtest (§8.6).

### 9.4 Performance (designer's hold)

Every block now buys some of every category, so household demand rows grow (today 1,978 of
the 5,687 opening blocks, 64 % of the 1900 population, sit below wealth 25 and buy five
items; 3,709 blocks buy the comfort or luxury lists of about 21 items). This is a cost risk in market clearing. Under
the hold I will not run `pnpm bench`, perfPhases or perfBench, nor optimise; they are reported
as skipped at the designer's request. A row-count diagnostic (rows per day) is reported from
the tests without timing.

---

## 10. Contradictions and proposed resolutions

1. **Program P6 and GDD §17J.3 still say "goods catalogue (~22)".** Superseded by P5b
   (59 goods). Resolution: update both status lines; P6 adds only the dwelling good.
2. **GDD §6.4 (four tiers with wealth activation; "sustained fulfilment of comfort needs
   supports wealth growth").** Replaced for LES worlds by §2; wealth is driven by income as
   in §6.5. Resolution: amend §6.4 with a P6 implementation record, keep the tier text for
   legacy worlds (Q9a); D-153.
3. **D-135 A4** (comfort and luxury scaled to the 1901 budget at base prices; income above it
   stays as cash) and **D-148 item 7** (food-article carve) and **item 13 change 1** (cloth
   factor). Superseded by the LES parameters for the 1900 world. Resolution: record in D-153.
4. **D-122 / P2b price level.** Retail margins use market prices, which already carry each
   market's price level; no conflict, noted.
5. **GDD §6.8 / M5 migration coefficients "stand in for transport/housing friction".**
   Housing now exists but migration does not read it. Resolution: leave to P7 (rural-to-urban
   migration "toward jobs and housing"), noted in the program.
6. **"Physical dwelling stock per province"** vs the block-held stock of Q5a: province
   figures are exact sums; resolution depends on Q5.
7. **E3 header comment** (`construction.ts`: "materials are not consumed") is out of date
   since E4. Housing does not use E3. Resolution: correct the comment in passing.

---

## 11. Risks

- **Calibration shift.** Demand from income changes every placement; the 1900 world changes
  more than in any P5b step. Mitigation: before/after report per country; designer review
  before the scenario is re-pinned.
- **Uncovered blocks.** Clerks, capitalists and academics without covered jobs live on λ and
  their cash; their consumption falls over decades until P7/P10 give them income. Reported.
- **US-only evidence.** The 1901 survey is US wage earners; other countries differ through
  prices, incomes and committed quantities, not through the marginal shares. The Board of
  Trade budgets are a report-only cross-check.
- **Performance** (§9.4).

---

## 12. Implementation order after approval

1. Sources: create `.cache-p6/` (git-ignore first); transcribe Table V-C (already read), V-A/V-B,
   the retail food prices, the census dwelling counts, the *Historical Statistics* series, the
   1990 survey (Q1b); `packages/data/data/historical/p6/sources_1900.json` with licences.
2. Simulation, tests first: the demand-system module (pure functions), saving and income
   smoothing; market integration (tiers 1/3/6 and the dwelling row); housing state,
   depreciation, purchases and conservation; crowding in mortality and unrest; validation;
   schema 34; legacy path kept. Commit.
3. Generator: demand parameters, the dwelling good and residential builder, 1900 dwelling
   stock, placement with LES demand, `docs/P6_BEFORE_AFTER.md` and
   `docs/P6_DEMAND_PROVENANCE.md`; data v14; province scenario, worker scenario and app worker
   bundle rebuilt (`:check` current). Designer review of the before/after before the hash is
   re-pinned. Commit.
4. Protocol 23, snapshot, the three UI changes, playtest extended. Commit.
5. `pnpm test` (background), `pnpm typecheck`, playtest, `pnpm app:export`; D-153 (and later
   numbers) in `DECISIONS.md`; program and GDD status lines; completion report. Benchmarks
   skipped at the designer's request.

---

## Appendix A. The 1901 budgets by income class (read for this plan)

Commissioner of Labor, *Eighteenth Annual Report, 1903: Cost of Living and Retail Prices of
Food*, Table V-C, "Expenditure per family in normal families, by States and classified
income", **All States**, book p. 558 (PDF 699 of the cached archive.org scan
`costlivingandre00labogoog`), read from the page image. USD per family per year; 11,156
families. Each row's five items sum to its "total of preceding"; the family counts sum to
11,156; the "total of all" column is cut by the binding in the scan and is computed as
preceding + food (the visible digits agree).

| Income class | Families | Rent | Fuel | Lighting | Clothing | Sundries | Food | Total | Food share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| under $200 | 32 | 33.16 | 13.10 | 2.48 | 17.00 | 30.52 | 99.59 | 195.85 | 50.9 % |
| $200–300 | 115 | 56.29 | 19.01 | 3.54 | 27.05 | 58.62 | 147.84 | 312.35 | 47.3 % |
| $300–400 | 545 | 72.59 | 23.20 | 4.41 | 38.94 | 62.52 | 186.85 | 388.51 | 48.1 % |
| $400–500 | 1,676 | 86.54 | 25.83 | 5.20 | 53.10 | 76.91 | 218.46 | 466.04 | 46.9 % |
| $500–600 | 2,264 | 99.55 | 27.46 | 6.05 | 64.69 | 92.99 | 249.28 | 540.02 | 46.2 % |
| $600–700 | 2,336 | 113.03 | 28.45 | 6.82 | 78.76 | 118.59 | 265.93 | 611.58 | 43.5 % |
| $700–800 | 2,094 | 125.82 | 28.72 | 7.78 | 93.52 | 149.78 | 287.03 | 692.65 | 41.4 % |
| $800–900 | 806 | 131.51 | 29.83 | 8.47 | 104.58 | 177.39 | 318.80 | 770.58 | 41.4 % |
| $900–1,000 | 684 | 143.53 | 31.44 | 9.08 | 117.10 | 189.45 | 325.66 | 816.26 | 39.9 % |
| $1,000–1,100 | 340 | 157.74 | 33.95 | 10.39 | 135.50 | 213.16 | 349.00 | 899.74 | 38.8 % |
| $1,100–1,200 | 96 | 161.42 | 35.35 | 10.55 | 144.89 | 254.22 | 366.66 | 973.09 | 37.7 % |
| $1,200 and over | 168 | 183.08 | 40.54 | 12.44 | 165.44 | 267.32 | 383.64 | 1,052.46 | 36.5 % |
| **All** | **11,156** | **111.97** | **28.20** | **6.92** | **79.98** | **124.26** | **266.47** | **617.80** | 43.1 % |

**Linear Engel curves** (family-weighted least squares of each item on total expenditure E,
the LES form e_k = a_k + β_k E; computed for this plan, not yet in a source row):

| Item | Marginal share β | Intercept a (USD) | Share at the mean | RMS residual (USD) |
|---|---:|---:|---:|---:|
| Food | 0.306 | 77.16 | 0.431 | 5.73 |
| Rent | 0.163 | 11.54 | 0.181 | 2.25 |
| Clothing | 0.183 | −33.14 | 0.129 | 1.71 |
| Fuel | 0.019 | 16.44 | 0.046 | 1.00 |
| Lighting | 0.011 | −0.09 | 0.011 | 0.11 |
| Sundries | 0.318 | −71.92 | 0.201 | 6.15 |

The β sum to 1 and the intercepts to 0, as the LES requires. In the LES, a_k = p_k γ_k − β_k C,
where C is the total committed cost; the intercepts alone cannot fix C (any C fits), which is
why Q2 asks for the committed quantities to come from physical requirements. Food's share
falls because its intercept is positive (food share = β + a ÷ E). The fit is on families, not
persons; family size by income class (Table V-A) would allow a per-person fit and is to be
transcribed.
