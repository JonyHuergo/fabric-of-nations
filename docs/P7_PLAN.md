# P7 plan — Labour market, wages, social mobility, urbanisation

**Status:** approved by the designer on 2026-11-08; implementation not started. Q1 (the profession set) was decided by the designer
in conversation on 2026-11-08 before this plan was written. On 2026-11-08 the designer approved
the recommendations of Q2–Q14 and Q17–Q22, deferred the fibre good (Q15, Q16: not resolved now,
§8 kept for reference) and asked for the costs of the minimum wage, now §4.5 and Q23, approved the same day. The plan is approved; implementation follows §15.
**Branch:** `prosperity/p7-labour` (from `main` at `5a7eb22`; local commits only).
**Inputs read:** AGENTS.md; `docs/PROSPERITY_PROGRAM.md` (P7 with "Added from P6" and "Carried
into P7 from P6", P7b, stage map); GDD §5.4.4 (M5 migration and labour access), §6.2, §6.3,
§6.7, §6.8, §7.7, §9.1, §17A.9, §17J; `P6_COMPLETION_REPORT.md` §7 and
`P5B_COMPLETION_REPORT.md` §11; D-052, D-078, D-115 to D-124, D-126, D-135, D-142, D-146,
D-148 (items 11–13), D-153 with its addition; `docs/P6_PLAN.md` (format); the simulation's
labour path (`economy/employment.ts`, `labor.ts`, `migration.ts`, `settlement.ts` wage groups,
`localWages.ts`, `fiscal.ts` administration payroll, `technology.ts` education staffing),
`population/types.ts` (`PopBlock`), `population/housing.ts`, `economy/householdDemand.ts`;
`scripts/p2/build-province-scenario.mjs` (profession split), `scripts/p2b/build-money-calibration.mjs`
(wage tables), `scripts/p5b/catalogue.mjs` (`TEXTILE_CALIBRATION`), `scripts/p6/demand.mjs`
(1900 incomes); the P5b acceptance test `data/world-1900` › "cotton and wool follow the 1900
world fibre supply"; `.cache-p5b/PROGRESS.md` and `.cache-p6/PROGRESS.md`.
**Design discussion before the plan (2026-11-08):** the designer asked for a review of the
professions against Victoria 3's pop types, the planned military revamp (servicemen and officers
by branch), a future religion system, four ideologies (liberalism, traditionalism, fascism,
communism) and every era of the twentieth century, and approved the sixteen professions of §3.
Victoria 3 was read from its community wiki (Pops and Profession pages, checked by their editors
against version 1.13); mechanisms only, no game data is used.

Material ambiguities are collected in **§0** with a recommendation each. Contradictions with the
GDD and earlier decisions are in **§13**. None has been settled silently.

---

## 0. Decisions needed from the designer

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **The profession set.** | (a) The GDD's nine. (b) Sixteen professions, behaviour from data roles, stratum a default rather than a fixed class (§3). | **Decided (designer, 2026-11-08): (b)**: Peasants, Farmers, Laborers (including skilled manual workers), Attendants, Servicemen, Officers, Clerks, Shopkeepers, Teachers, Medics, Engineers, Academics, Bureaucrats, Clergy, Capitalists, Aristocrats. |
| Q2 | **Servicemen, Officers and Clergy in P7.** No system employs them yet: armies remove recruits from blocks (`military.ts`), and there is no religion. | (a) Define them in data with their roles; populate them in the military-revamp and religion stages. In 1900 their people stay in the professions the occupation mapping gives as interim (§3.4). (b) Populate them now with interim employers (army personnel as Servicemen; a church service funded by donations). | **Approved (designer, 2026-11-08): (a)**: (b) pulls military and religion design into P7. The engine is built for all sixteen, so populating them later is a data and generator change. |
| Q3 | **Medics and the health service.** Health staff are today a share of the administration clerks (D-078 item 9). | (a) The health service employs Medics: health slots = health share × administration funding ÷ the Medic wage; administration slots = the rest ÷ the Bureaucrat wage. The player's health-share lever is unchanged. (b) Keep clerks as health staff; Medics wait. | **Approved (designer, 2026-11-08): (a)**: it removes the documented simplification and gives health a gated, scarce profession. It changes health staff counts and so P4 mortality; the 1900 health factor is re-measured and reported. |
| Q4 | **Public institutions as employers.** Administration payroll is paid to every block of the administration profession in proportion to its population (`fiscal.ts`), while the same people can also hold building jobs: one person can be paid twice, against GDD §6.7. | (a) Administration, schools, universities and research, and the health service post job slots, filled by the same allocator as buildings and paid per assigned worker at the market wage from the treasury; funding sets the number of slots (funding ÷ local wage). (b) Keep the proportional payroll. | **Approved (designer, 2026-11-08): (a)**: one person holds one job; Bureaucrats, Teachers, Academics and Medics get covered jobs (a P6 carry-over); a fixed budget buys fewer staff when wages rise. |
| Q5 | **Where a worker may work.** Today a resident may take a job anywhere in their own country (D-052), and is paid their *home* province's wage. | (a) A worker works in their own province; moving to another province is migration (§6). The wage is the employing province's. (b) National access as now, with provincial wages. | **Approved (designer, 2026-11-08): (a)**: provincial wage differentials and migration only mean something if people cannot commute across the country. The 1900 buildings were split over provinces by the population of the professions they employ (D-131), so local matching starts close; the residue is reported. |
| Q6 | **The wage rule** (§4.1). | (a) Monthly, per (customs territory, profession): Δln W = κ↑·max(0, v − u) − κ↓·max(0, u − v) + π·Δln P, with v the vacancy rate, u the unemployment rate and P the territory's consumer price index; a provincial differential moves with the province's own v − u against the territory's, renormalised to a population-weighted mean of 1. (b) Symmetric adjustment, no price term. (c) Wages set to clear each month (marginal revenue product). | **Approved (designer, 2026-11-08): (a)**: the vacancy and unemployment rates are already measured; asymmetry carries downward stickiness; the price term is GDD §7.7's "inflation/price conditions". (c) jumps and has no history. |
| Q7 | **Wage floors** (§4.2). | (a) Effective wage ≥ max(statutory minimum wage (E5), the province's peasant alternative income) for every wage profession where the province has a peasant block; the alternative is the peasant blocks' income per worker over the last month (wage, distributed profit and food kept). (b) Minimum wage only. | **Approved (designer, 2026-11-08): (a)**: the program names both floors; the alternative income is the Lewis reservation wage, measured, not authored. |
| Q8 | **Hiring and layoffs** (§4.3). | (a) Each building keeps a staffing ceiling c ∈ [0, 1]; monthly c ← clamp(c + η·(R − 1)) where R = notional value added per throughput unit at smoothed market prices ÷ the wage bill per throughput unit at current wages (upkeep excluded: it is paid whether or not the building works). Slots offered = floor(slots × c). (b) Bang-bang: full slots if R ≥ 1, none otherwise. | **Approved (designer, 2026-11-08): (a)**: "hire to the point where revenue covers the wage" with adjustment over months; heterogeneous techniques (D-135 A3) make the least productive buildings shed first. Closure and bankruptcy stay in P10. |
| Q9 | **Peasant farms.** | (a) Work-sharing: buildings of the `subsistence` role employ every eligible member of their owner's profession up to their slots, with no layoff rule; income is the average product (P5's land returns make the marginal product fall). (b) The hiring rule for peasant farms too. | **Approved (designer, 2026-11-08): (a)**: the surplus-labour sector of the dual economy (GDD §17J.1). Without it peasants would become unemployed instead of underemployed. |
| Q10 | **Mobility pressure** (§5.2). | (a) Harris–Todaro expected income: a flow from block A to profession B in the same province when ln(E_B ÷ E_A) exceeds a threshold, with E = wage × (1 − unemployment rate) × a housing factor (§6.3); rate provisional; bounded by the gated movers and by B's vacancies plus a share of its labour force. (b) The M5 form (vacancy and wealth gaps). | **Approved (designer, 2026-11-08): (a)**: it lets towns attract people faster than jobs (urban unemployment) and lets demotion happen when a profession's unemployment rises. |
| Q11 | **Who moves.** | (a) Households: movers are split over the source's sex and age cells in proportion (the M5 largest-remainder rule), so age structure is carried. (b) Age-selective (young adults weighted up, children following). | **Approved (designer, 2026-11-08): (a)** for P7, as M5; (b) as a later calibration if the long run shows towns ageing wrongly. |
| Q12 | **Qualification gates** (§5.3). | (a) Selective literacy (movers into a literate profession are taken from the source's literate working-age people, by age, so literate persons are conserved); training capacity (entries into trained professions per month ≤ the country's training places, paid at the training cost); capital (entry into owner professions requires the source's cash per person ≥ the profession's entry capital, carried with the movers); legal hooks (a profession can be closed to entry; Aristocrats are closed). (b) Keep today's block-level thresholds (literacy and wealth level). | **Approved (designer, 2026-11-08): (a)**: today's all-or-nothing block thresholds cannot gate flows; (a) is causal and conserving. |
| Q13 | **Dwellings when people move** (§6.4). | (a) Movers who keep their settlement (rural to rural, urban to urban, in the same province) carry a pro-rata share of the source's dwellings; movers who change settlement or province leave their dwellings with the source and crowd the destination until it builds. (b) Always leave them (the P6 migration rule). | **Approved (designer, 2026-11-08): (a)**: a peasant who becomes a farmer in the same village keeps their house; a peasant who goes to town does not. |
| Q14 | **Block creation and retirement** (§5.4). | (a) A flow to a profession with no block in the province creates one through a validated operation (new id from a persisted allocator, accounts opened, attributes from the movers); a block is retired when it has no people, no employment and owns nothing; owned buildings and residual cash pass to the block that received most of its people, through ordinary postings. (b) Keep empty blocks. | **Approved (designer, 2026-11-08): (a)**, as D-117 requires. |
| Q15 | **The fibre good** (§8). The program says "the textile mill recipe", but the P5b acceptance test fixes the mill's cotton + wool at 316.667 kg per throughput unit. | (a) A separate **bast-fibre mill** (linen, hemp and jute spinning and weaving) that makes the same *textiles* good from bast fibre, placed at the sourced 1900 producers (Belfast, Dundee, Calcutta, Russia, France, Germany, Austria, Belgium); the textile mill's recipe and the test are untouched. (b) Bast fibre as a third input of the textile mill, with the test's mass-balance line amended to cotton + wool + bast = 316.667 by design. | **Deferred (designer, 2026-11-08): not resolved in this plan.** Proposed: (a): the industries were separate and sat in different places; it keeps the acceptance test exactly as written. |
| Q16 | **Jute.** Most 1900 jute became sacking and bagging, which has no demand in the model. | (a) All bast fibres (flax, hemp, jute) become textiles; the measured cotton ratio is reported. (b) Flax and hemp only; jute waits for a packaging demand. (c) Jute with its own packaging demand (sacks bought per tonne of grain, sugar, coffee and cotton shipped). | **Deferred (designer, 2026-11-08): not resolved in this plan.** Proposed: (a), measured: the cotton band is met for 1.33–2.65 million t of bast textiles (§8.3). If the sourced total lands outside the band, the result comes to the designer before any change, as with Q12 of P6. |
| Q17 | **1900 occupation data** (§3.3). | (a) Sourced census occupation tables mapped to the sixteen professions through a documented mapping (occupation group × status in employment × sector), for every territory with a c. 1900 census; elsewhere a recorded proxy (shares regressed on GDP per head and urban share over the sourced countries), provisional. (b) Keep the P2 authored mix and only split it. | **Approved (designer, 2026-11-08): (a)**: the current mix is authored (`project-authored-1900`, OWID sector shares); clerks at 10.8 % and capitalists at 5.1 % of the 1900 world are catch-alls. |
| Q18 | **1900 incomes** (P6 carry-over). | (a) The generator computes each block's 1900 income from its employment in the placed buildings and institutions (the same allocation rule as day 1) × the 1900 wages, plus distributed profits and food kept; demand, placement and incomes are iterated to a fixed point (convergence reported). (b) Keep the estimate wage × participation × working-age share. | **Approved (designer, 2026-11-08): (a)**: the program asks for measured wages; (b) pays every working-age participant, employed or not. |
| Q19 | **Interest groups in P7.** The seven groups take members by profession key (`politics.json`). | (a) Data-only remap to the sixteen professions (§3.5); new groups (Devout, Petite bourgeoisie) wait for the politics stage. (b) Add the groups now. | **Approved (designer, 2026-11-08): (a)**. |
| Q20 | **Saves.** | (a) D-120: schema-34 saves listed as incompatible, never deleted. (b) A migration. | **Approved (designer, 2026-11-08): (a)**, as every Prosperity stage. |
| Q21 | **Legacy worlds** (M2–M11 fixtures, the M5 sample). | (a) Keep their professions and static wages: the labour market runs only where the definitions carry a labour-market configuration (as P6 kept the tier path). (b) Convert every fixture. | **Approved (designer, 2026-11-08): (a)**: preserves accepted behaviour and the legacy known answers. |
| Q22 | **The long run** (P6 carry-over). | (a) Ten years of the 1900 world in the background, reported as trajectories (agricultural share, unemployment, wages, urban share, population conservation, food gluts); no timing. (b) Twenty-five years. | **Approved (designer, 2026-11-08): (a)**; (b) on request. The performance hold is respected: the run is a behaviour check, not a benchmark. |
| Q23 | **Costs of the minimum wage** (§4.5). Today the E5 floor is a pure transfer: employment does not respond to it (D-078). | (a) Its costs come from modelled channels: lost jobs through the hiring rule, a regional bite from one national floor, coverage (never the self-employed; farm and domestic employees by law option) with spill-over into uncovered work, partial compliance from administration quality plus the law's administrative load, a dearer public payroll, prices and unemployment unrest; with a preview of jobs at risk before enactment. (b) Lost jobs through the hiring rule only. | **Approved (designer, 2026-11-08): (a)**: every cost is a mechanism the model already has or P7 adds; no penalty term. |

Also for the designer, not blocking: the block count (§11.2), the order of steps (§15).

---

## 1. Scope and what P7 replaces

P7 (program P7, GDD §17J.3) delivers:

1. **Wages:** monthly adjustment per (customs territory, profession) with provincial differentials
   from vacancy and unemployment rates; floors from minimum-wage law and the peasant alternative
   income. Wages replace the static P2b province wage tables as the authoritative wage.
2. **Hiring and layoffs:** hiring to the point where revenue covers the wage; layoffs when it does not.
3. **Professions:** sixteen professions (Q1), with a migration of the 1900 world's five and
   sourced 1900 occupation data.
4. **Mobility:** monthly flows between blocks of one province, carrying age structure, driven by
   vacancies and wage gaps, gated by literacy and training; blocks created and retired through
   validated, conserving operations (D-117).
5. **Urbanisation:** rural-to-urban migration toward jobs and housing; migration reads P6
   crowding and the desired dwelling stock.
6. **From P6:** blocks without covered jobs; measured 1900 incomes; a long run. The fibre good
   (cotton back to 0.85–1.15 of the 1900 crop) is **deferred by the designer** (Q15, Q16).
7. **Acceptance:** in a growing no-input economy the agricultural employment share falls;
   unemployment lowers wages; people are conserved through mobility and block creation and
   retirement; determinism; save round trip. The P5b cotton test ("cotton and wool follow the 1900
   world fibre supply") stays failing while the fibre good is deferred; it is kept and not weakened,
   and the completion report lists it as unmet.
8. **The minimum wage with costs** (§4.5, Q23).

**Unchanged:** market clearing and settlement (wages still paid after the market, pro rata when
cash is short), the P6 demand system and saving, the P4 demographic causes, money and trade,
military recruitment (until the military revamp), training's qualification premium (D-078).

---

## 2. The labour path today (inspected)

- **Eligibility** (`eligibleWorkforceForBlock`): floor(working-age persons × participation) if the
  block's literacy and wealth level reach the profession's thresholds, else 0 (all or nothing).
- **Allocation** (`refreshEmployment`, monthly and when dirty): existing matches retained in
  keyed order, then vacancies filled per profession by largest-remainder apportionment over
  eligible blocks and vacancy buildings, domestic first, across the whole country (D-052, D-133).
  A block may only take jobs of its own profession.
- **Wages** (`settlement.ts`): daily obligation = max(province wage of the *worker's* province,
  statutory floor) × hours factor × (1 + qualification premium) ÷ days in year, paid from the
  building's operating cash after the market. The province tables are the P2b territory tables
  (`wageRUSDPerYearByProfession`), fixed.
- **Institutions:** administration payroll is shared over all blocks of the administration
  profession (clerks) by population; health staff are a share of the clerk population; teaching,
  research and training staff are shares of the academic population (M9, E5). None of these are
  employment assignments.
- **Migration** (`migration.ts`, D-052): monthly, same profession, existing destination blocks
  only, vacancy and wealth pressure; dwellings stay with the source (P6); literacy, wealth,
  militancy and qualification merge by weight; urban share is the destination's.
- **1900 world:** 5,687 blocks in 1,687 provinces; peasants 55.7 %, laborers 26.7 %, clerks
  10.8 %, capitalists 5.1 %, academics 1.7 % of 1,584 million people. Clerks, capitalists and
  academics have few covered jobs and live on savings (P6 report §7.3).

---

## 3. The sixteen professions (Q1)

### 3.1 Principles

1. **A profession is an occupation**, the block key with the province (D-117). Other dimensions
   are separate:
   - religion (future) as a whole-number composition inside each block, never a block key;
   - ideology (future) as a composition derived from documented inputs (No-Mana);
   - legal status (serfdom, caste rules, forced labour) as law-defined conditions;
   - class: `stratum` stays in `ProfessionDef` as a default for P6 saving; deriving it from
     income and wealth is a later change (recorded, not in P7).
2. **Behaviour comes from roles in data**, never from profession keys in code (GDD §6.2: "do not
   add occupations by hardcoding behavior in multiple subsystems"). `ProfessionDef` gains
   `roles`; `politics.administrationProfessionKeys` and `technology.academicProfessionKeys` are
   replaced by role lookups (the legacy keys remain accepted for legacy definitions).
3. **One conserving reclassification operation** (§5.4) serves mobility, migration and later
   expropriation, collectivisation, land reform, demobilisation and religious and ideological flows.
4. **Conscripts are an assignment, career military a profession** (military revamp; P7 only
   defines Servicemen and Officers).

### 3.2 Definitions

| Id | Key | Stratum (default) | Definition | Roles | Employer | Gate (§5.3) | Settlement |
|---|---|---|---|---|---|---|---|
| 0 | peasants | lower | Smallholder and subsistence households producing mainly for their own use; collective-farm members later | subsistence | own farms (subsistence farm, commercial-farm-peasant, peasant workshop) | none | rural |
| 1 | laborers | lower | All manual wage workers, unskilled to trade-trained: farm hands, miners, construction, factory, dock and transport crews | wage-labour | farms, mines, industry, construction | none | by job |
| 2 | clerks | middle | Routine office staff in firms | wage-labour | offices of industry, banks, trading houses | literacy | urban |
| 3 | capitalists | upper | Owners of firms and senior managers of private firms | owns-capital, management | own buildings; management slots | capital | urban |
| 4 | academics | middle | Professors, researchers, scientists, lawyers, writers, journalists, artists | research, training | universities and research (M9 research staff, E5 instructors) | literacy, training | urban |
| 5 | farmers | middle | Owner-operators of commercial family farms | owner-operator | own commercial farms | capital | rural |
| 6 | attendants | lower | Domestic servants, shop and hospitality staff, carers, carters and porters | wage-labour | personal services, trading houses, transport, post, warehouses | none | urban |
| 7 | servicemen | lower | Career enlisted personnel of every branch, gendarmerie and police | military-enlisted | military formations (military revamp) | law | by posting |
| 8 | officers | middle | Commissioned officers of every branch | military-command | military formations (military revamp) | literacy, training, law | by posting |
| 9 | shopkeepers | middle | Self-employed non-farm workers: shopkeepers, artisans, small masters, informal own-account workers | owner-operator | own workshops, jewellers, shops | capital | urban |
| 10 | teachers | middle | Primary and secondary teachers | education | schools (the M9 teaching staff) | literacy, training | by job |
| 11 | medics | middle | Physicians, nurses, pharmacists, midwives | health | the health service (Q3) | literacy, training | by job |
| 12 | engineers | middle | Engineers, industrial scientists, technicians, computing staff | wage-labour, technical | modern industry, power, chemicals | literacy, training | urban |
| 13 | bureaucrats | middle | Public administration by function, including state-enterprise directors and party officials in one-party states | administration | administration (Q4) | literacy | urban |
| 14 | clergy | middle | Religious ministers and orders | clergy | churches (religion stage); church schools and hospitals where law allows | literacy, law | by job |
| 15 | aristocrats | upper | Landed households living on land income | owns-land | own estates | closed to entry | rural |

Ids 0–4 keep the 1900 world's existing ids (fixture and save encodings stay readable); the M11
`professions.json` (four professions) and `historical_professions.json` are legacy (Q21).

Participation rates are re-derived from the census gainful workers by group ÷ working-age
population (sourced where a census gives them, provisional otherwise). 1900 reference wages (the
initial condition of §4) keep the P2b method — the territory's laborer wage × the US 1900 ratio
of the profession's earnings to the laborer's — with new US 1900 rows for the new professions:
teachers (the existing `us-teacher-salary-1900`), physicians and nurses, engineers and
salaried officials (Census 1900 manufactures), federal clerks (Official Register 1901),
domestic servants (Commissioner of Labor reports; Salmon, *Domestic Service*, 1897), farm
operators (Census 1900 agriculture), retail proprietors, army and navy pay tables (1900), and
ministers' salaries (Census of Religious Bodies 1906). All US government or out of copyright;
each a source row with licence.

### 3.3 1900 occupation data (Q17)

- **Mapping.** Each census's occupation groups are mapped to the sixteen professions by a
  documented table: occupation group × status in employment (employer, own account, employee,
  family worker) × sector (agriculture, industry, services, public administration). For example,
  agriculture own-account and family workers → Peasants or Farmers by farm size where the census
  splits it; agricultural employees → Laborers; industry own-account → Shopkeepers; industry
  employers → Capitalists; domestic service → Attendants; public administration non-manual →
  Bureaucrats; teaching → Teachers; medicine → Medics; clergy → Clergy. The same scheme lines up
  with HISCO for historical censuses and with ISCO-88 for the 1990 validation in P15.
- **Candidate sources (public domain unless noted; each checked before use):** US Twelfth Census
  1900, *Occupations* (special report 1904); England and Wales, Scotland and Ireland 1901 census
  general reports; *Statistik des Deutschen Reichs*, Berufs- und Gewerbezählung 1895 (and 1907);
  France, *Résultats statistiques du recensement* 1901; Italy, *Censimento* 1901; Austria 1900
  and Hungary 1900 occupation volumes; Belgium 1900, Netherlands 1899, the Nordic 1900 censuses;
  Russian Empire 1897 census (*Obshchii svod*); Census of India 1901 (occupation tables);
  Argentina 1895, Mexico 1900; Japan's pre-census estimates; and the compilations already cached,
  Webb's *New Dictionary of Statistics* (1911) and Mulhall's *Dictionary of Statistics* (1899).
  IPUMS and NAPP microdata are not used unless their terms allow commercial use (they require
  registration and restrict redistribution; if needed, the designer decides). HathiTrust copies
  are requested from the designer.
- **Elsewhere:** each profession's share regressed on GDP per head and urban share over the
  sourced territories, with the proxy recorded per territory (as D-135 A8). Provisional.
- **Within territories:** the P2 rule generalised by settlement (§3.2 last column): rural
  professions by HYDE rural population, urban professions by urban population, by-job professions
  by total population. The P4 urban-share assignment (D-142 item 7) follows the same settlement
  order instead of the hard-coded "clerks, laborers, academics and capitalists first".
- **Interim placement of Servicemen, Officers and Clergy (Q2a):** their census counts are kept in
  the source rows and placed in Laborers (servicemen), Bureaucrats (officers) and Academics
  (clergy) until their stages populate them; the generator report lists the counts.

### 3.4 Buildings, owners and institutions (migration of the 1900 world)

Job slots are re-mapped per building definition (generator; `buildings_definitions_1900.json`),
keeping each definition's workers per throughput unit:

| Buildings today | Jobs today | Jobs after P7 |
|---|---|---|
| subsistence farm, commercial-farm-peasant, peasant workshop | peasants (+ clerks) | peasants |
| ranch, fishery, dairy farm, market garden, tobacco farm, cotton farm, silk farm, rubber estate, plantation, sugar estate | peasants (+ laborers) | farmers (family farms), laborers (estates and plantations), by definition |
| commercial and mechanised farms, mines, oil and gas fields, logging, textile and power-loom mills, food processing, cement | laborers | laborers |
| workshop, jewellery workshop | clerks, laborers | shopkeepers, laborers |
| trading house, transport company, post and telegraph, personal services, warehouse | laborers, clerks | attendants, clerks |
| the 26 industrial buildings with clerks | laborers, clerks | laborers, clerks; engineers in heavy industry and power (provisional share) |
| the 12 modern buildings with academics | laborers, clerks, academics | laborers, clerks, engineers |
| bank and office | clerks, capitalists, academics | clerks, capitalists |
| residential builder | laborers, clerks | laborers, clerks |

- **Owners:** workshops and jewellers → shopkeepers; family farms → farmers; estates,
  plantations, sugar estates and large commercial farms → aristocrats where a land-distribution
  source supports it (Russia, Prussian east, the United Kingdom, Latin America, India's
  zamindari; provisional shares by region), otherwise capitalists; peasant farms stay with peasants.
- **Institutions (Q3, Q4):** administration → Bureaucrats; teaching staff → Teachers; research and
  training staff → Academics (M9's `researchStaffShare` and E5's `trainingStaffShare` become shares
  of the academic staff only; teaching capacity comes from Teachers); health → Medics.

### 3.5 Interest groups (Q19, data only)

| Group | Members after P7 (weights provisional) |
|---|---|
| aristocrats | aristocrats 1.0 |
| capitalists | capitalists 1.0, shopkeepers 0.4 |
| labor | laborers 0.9, attendants 0.8, clerks 0.3 |
| intelligentsia | academics 1.0, teachers 0.6, medics 0.5, engineers 0.5 |
| military | officers 1.0, servicemen 1.0 (empty until the military revamp), laborers 0.1 |
| bureaucrats | bureaucrats 1.0, clerks 0.3 |
| rural | peasants 1.0, farmers 1.0 |

Clergy and the remaining shopkeepers weigh into no group until Devout and Petite bourgeoisie
exist (politics stage); they still count in elections and unrest.

---

## 4. Wages, floors and hiring

### 4.1 The wage rule (Q6)

State per customs territory *m* and profession *p*: the reference wage W_mp (RUSD a year); per
province *r* and profession: the differential d_rp (dimensionless, population-weighted mean 1 over
the territory's provinces). Effective wage w_rp = max(W_mp × d_rp, floors (§4.2)).

On the first civil day of each month, after the employment refresh, from the previous month's
state:

- u_mp = unemployed eligible ÷ eligible labour force; v_mp = unfilled offered slots ÷ (filled +
  unfilled offered slots), both over the territory; u_rp, v_rp the same in the province.
- **Territory:** Δln W_mp = κ↑ · max(0, v − u) − κ↓ · max(0, u − v) + π · Δln P_m, with P_m the
  territory's consumer price index (smoothed market prices weighted by the 1900 household basket).
  Provisional: κ↑ = 0.10, κ↓ = 0.04 a month per unit gap, π = 0.5. At 10 % unemployment and no
  vacancies a wage falls 0.4 % a month, about 5 % a year. Status: provisional; calibrated in
  P15 against wage curves (an unemployment elasticity of about −0.1) and pre-1914 wage series.
- **Province:** Δln d_rp = κ_d · ((v_rp − u_rp) − (v_mp − u_mp)), κ_d provisional 0.05, then the d_rp
  are rescaled exactly so their population-weighted mean is 1 (a normalisation, not a clamp).
- **Professions without a labour market:** peasants (work-sharing, Q9) and owner-operators earn
  the residual through profit distribution; their wage is the obligation used to split income
  between wage and profit and follows the same rule. Unpopulated professions keep their 1900 wage.
- **Initial condition:** W_mp and d_rp from the P2b territory tables (d = 1) and the §3.2
  reference wages. The province tables stop being authoritative; `ProvinceEconomy.wageRUSDPerYearByProfession`
  is removed from state.
- **Who pays:** the employing building or institution pays the wage of *its* province (Q5a).

### 4.2 Floors (Q7)

- **Statutory:** the E5 minimum wage (`labor-minimum-wage`), applied to the effective wage of
  covered employment only, with the enforcement and coverage rules of §4.5 (Q23).
- **Peasant alternative income:** in a province with a peasant block, a = (wages + distributed
  profits + food kept at market prices) of the peasant blocks over the last month ÷ their employed
  peasants, smoothed over a year. Every wage profession's effective wage in the province is at
  least a. Units RUSD a year per worker; monthly cadence; measured, not authored.
- Floors bind the paid wage only; W_mp keeps moving underneath, so a floor that stops binding
  releases the market wage (no ratchet).

### 4.3 Hiring and layoffs (Q8, Q9)

- **State:** `BuildingInstance.staffingCeiling` c ∈ [0, 1], 1 at world creation.
- **Profitability:** R = (Σ outputs q·p̄ − Σ inputs q·p̄) × technique ÷ Σ_jobs workers × w, per
  throughput unit at full staffing, with p̄ the market's 30-day smoothed prices (P6 state) and w the
  current effective wages; for land-using buildings the value added of the last throughput unit
  (P5's land function) instead of the average. Upkeep is excluded (sunk in the short run).
- **Monthly:** c ← min(1, max(0, c + η · (R − 1))), η provisional 0.5 a month; slots offered =
  floor(slots × c) per profession. The employment refresh retains matches up to the offered slots,
  so a fall in c is a layoff and a rise a vacancy. An idle building (c = 0) still pays upkeep and
  is re-evaluated monthly at notional values; closure is P10.
- **Subsistence buildings** (role `subsistence`) have c = 1 always and take every eligible
  peasant up to their slots: underemployment, not unemployment.
- **Institutions** offer slots = floor(funding ÷ local wage) per staffed function (Q4); a
  shortfall in treasury cash is today's shortfall, never debt.
- **Accounting:** no new posting kinds. Wages stay `wages` (buildings), `administration-payroll`
  and the M9/E5 payrolls (institutions, now per assigned worker); laid-off workers simply have no
  assignment; no severance or unemployment benefit (welfare law as today).

### 4.4 Wages, incomes and saving (P6)

Wages enter the block's smoothed income (P6) as today; unemployment lowers it, consumption falls
toward the committed basket and drawdown (λ) supports it; saving by stratum is unchanged (the
stratum default of §3.2). Owner incomes come through M5a profit distribution, which the 1900
world already enables. Measured incomes replace the generator's estimate (Q18, §9.2).

### 4.5 The minimum wage and its costs (Q23)

**Today the floor costs nothing.** E5 applies one national annual floor (RUSD, so constant in real
terms) to every wage obligation; employment does not respond to wages (D-078 records this as a
limitation). A higher floor is a transfer from employers to workers whose only cost is wages an
employer cannot pay (reported as unpaid). Real minimum wages have costs; P7 makes them causal.

**Costs (all from modelled channels; no penalty term):**

1. **Lost jobs.** R (§4.3) is computed with the wage actually owed, floor included. Buildings whose
   value added per worker falls below the floor lower their staffing ceiling: the least productive
   first (low technique, labour-intensive recipes, poor provinces).
2. **Regional bite.** One national floor sits far above the market wage in poor provinces and
   below it in rich ones, so unemployment concentrates in poor provinces and migration (§6.2)
   carries people toward rich ones. Emergent from provincial wages; nothing authored.
3. **Coverage and the uncovered sector.** The floor covers employees of buildings and
   institutions. It never covers the self-employed: work-sharing peasant farms (Q9) and the own
   income of farmers and shopkeepers. Whether farm employees and domestic service (attendants in
   personal services) are covered is part of the law option (data `coverage`); many historical
   laws left them out (for example the US Fair Labor Standards Act of 1938; to cite from the act).
   People who lose covered jobs move by mobility (§5) into uncovered work, whose income then falls
   (informal work grows).
4. **Enforcement.** Covered employers comply in proportion to administration quality (M8,
   derived): the paid wage = market wage + compliance × max(0, floor − market wage), with
   compliance = administration quality ^ γ, γ provisional 1. A weak state's floor is partly paper.
   The law option adds its `institutionLoad` (an existing law field) to the administration, so
   enforcing it draws on administrative capacity used elsewhere.
5. **The public payroll.** Institutions pay the floor too, so a fixed budget buys fewer
   bureaucrats, teachers and medics (slots = funding ÷ wage, §4.3).
6. **Prices.** Shed output raises the market price of the goods affected (ordinary clearing), part
   of which falls on the minimum-wage earners themselves.
7. **Unrest.** Unemployment already raises unrest (M8). Its rate is today 1 − employed ÷
   working-age persons, which counts everyone outside the labour force as unemployed; P7 uses the
   labour-market unemployment rate instead (§13).

**Benefits stay real:** covered workers who keep their jobs earn more, raising their consumption
(P6), and through income their fertility and mortality causes (P4); wage dispersion narrows.

**Not modelled, stated in the UI and the report:** monopsony (an employer with wage-setting power,
where a modest floor can raise employment), efficiency wages, and pay rises spreading up the wage
scale. P7's labour market is competitive, so a binding floor always costs some jobs; how many
depends on how far it sits above the market wage. Studies of modest floors find small employment
effects, which is consistent with a floor close to the market wage here; a monopsony refinement is
a later item.

**Preview before enacting** (GDD §17A.12.3): the Labour screen's minimum-wage row shows, for the
proposed floor, covered workers, workers now paid below it, and jobs at risk = filled slots in
covered buildings whose R at the proposed floor is below 1, labelled a short-run estimate that
leaves out the movements of prices and people.

---

## 5. Social mobility

### 5.1 Cadence and order (first civil day of a month)

employment refresh → wage update (§4.1) → staffing ceilings (§4.3) → **mobility** (between
professions inside a province) → **migration** (between provinces, same profession) → employment
refresh (dirty) → market. The day is one unit under D-116 rollback.

### 5.2 Pressure (Q10)

For blocks A (profession a) and target profession b in province r:

- E_x = w_rx × (1 − u_rx) × H_rx, the expected income (Harris–Todaro) with the housing factor of
  §6.3; for an unpopulated profession in the province, the territory's u and the province wage.
- Pressure P = ln(E_b ÷ E_a) − θ, θ provisional 0.10 (moving cost and attachment).
- Flow = min(gated movers (§5.3), ρ · max(0, P) · N_A, vacancies_b + β · labour force_b), with ρ
  provisional 0.02 a month per unit pressure and β provisional 0.05 (people move to towns ahead of
  jobs). Integer people by largest remainder; keyed tie order (purpose `mobility.order`).
- Candidate targets: every profession the source qualifies for, plus demotion targets (those with
  lower gates); flows A→b and B→a in the same month are netted.
- A source block moves at most 2 % of its population a month in total (provisional bound standing
  in for frictions not modelled; documented, not a repair).

### 5.3 Gates (Q12)

- **Literacy (selective):** for professions with the `literacy` gate, movers are literate
  working-age people. Per age, literate movers ≤ literacy_age × persons_age; the source's
  `literacyByAge` is recomputed without them and the destination's merged with literacy 1 for the
  movers' cells, so literate persons are conserved exactly (to the documented rate tolerance).
  Eligibility for employment becomes literate working-age persons × participation for those
  professions (replacing the all-or-nothing block threshold).
- **Training:** entries into Teachers, Medics, Engineers, Academics and Officers in a month ≤ the
  country's training places for that profession: E5 instructors × trainees per instructor ÷ the
  profession's course length (data: provisional 2, 5, 4, 5 and 3 years). The training cost
  (`trainingCostRUSD`, now non-zero for these) is paid from the movers' household cash to the
  academic instructors through the existing `training-stipend`/`training-payroll` accounts; a
  source that cannot pay sends fewer movers.
- **Capital:** entry into Farmers, Shopkeepers and Capitalists requires the source's cash per
  person ≥ the profession's entry capital (data, provisional: one year of the profession's 1900
  income); the movers carry their pro-rata cash as in M5. No building changes hands: the movers
  take jobs in the profession's buildings, and ownership stays where it is until P9/P10.
- **Law:** `ProfessionDef.entry: "open" | "closed"`; Aristocrats are closed (exit only). Law
  options that open or close professions are future ideology content; P7 adds only the hook.
- **Exit:** every profession may move to one with a lower gate (demotion), including Aristocrats.

### 5.4 The reclassification operation (Q14)

`moveBlockPeople(world, source, destinationProvince, destinationProfession, count, settlement,
context)`, validated before mutation, used by mobility and migration:

1. **People:** cells split by largest remainder (M5 rule, keyed `mobility.age-remainder`);
   population conserved exactly.
2. **Destination block:** found, or **created** when absent: id from a new persisted
   `World.nextPopBlockId`; household cash and income accounts opened through the existing account
   factory; attributes from the movers (literacy by age, qualification, wealth level, militancy,
   need counters, food sufficiency, lagged child mortality, the three demographic residuals of the
   source, smoothed income); fractional remainders start at 0; dwellings and housing references by
   §6.4.
3. **Merges** into an existing block: literacy by age, qualification, wealth, militancy, smoothed
   income, food sufficiency and lagged child mortality by person weight; need counters, remainders,
   residuals and housing references stay with the destination (as D-052).
4. **Cash:** pro-rata household cash through a balanced `migration-transfer` posting (mobility
   reuses the kind with a reason field).
5. **Urban share:** the destination's urban persons rise by the movers placed in towns (§6.1);
   the source's fall by the movers who were urban; both shares recomputed from those counts.
6. **Employment:** the source's assignments are trimmed by D-126's rule; the day's refresh is dirty.
7. **Retirement:** a block with no people, no employment and no owned buildings is removed;
   residual cash goes to the block that received most of its people (or the province's block of
   the same stratum), with a posting; its accounts are closed (zero balance, owner marked retired,
   kept for the ledger). A block that still owns buildings at zero people passes them to the same
   recipient, with the ownership account updated in one validated step.

---

## 6. Urbanisation and housing

### 6.1 Settlement of jobs

A building's settlement is rural for the farm, ranch, fishery, plantation, estate, mining, oil,
gas and logging sectors and urban for the rest (definition data). A block's job settlement is the
mix of its assignments; movers into profession b settle in town in proportion to b's urban
vacancies in the province (all-rural or all-urban when §3.2 says so). Rural-to-urban migration is
therefore mobility out of farm professions into town jobs, plus migration between provinces.

### 6.2 Migration between provinces (M5, extended)

Same profession, monthly; pressure = the §5.2 expected-income gap between provinces instead of
the M5 vacancy and wealth gap, with the same housing factor; destination blocks may now be created
(§5.4); the D-052 border rule and the 1 % inflow cap stay. The M5 coefficients are replaced for
labour-market worlds and kept for legacy worlds (Q21).

### 6.3 Housing in the decision

H_rx = min(1, D ÷ D*)^η_h × (1 + K_h · max(0, c − 1))^−1, with D and D* the destination block's
dwellings and desired dwellings (P6), c its crowding, η_h provisional 0.5 and K_h provisional 0.5.
A destination with fewer dwellings than its residents want, or more crowded than in 1900, attracts
fewer people; building restores the pull. For a block about to be created, the province's
same-settlement blocks' values.

### 6.4 Dwellings and references on a move (Q13)

- Same settlement and province: movers carry dwellings × movers ÷ source persons.
- Different settlement or province: dwellings stay with the source (the P6 rule); the destination
  crowds until it builds, and the source's crowding falls.
- New block: housing references = the source's (its 1900 persons per dwelling and income), so
  desired dwellings respond to the movers' new income; on a merge the destination keeps its own.
- Conservation: Σ dwellings changes only by purchases and depreciation (P6 test extended to
  mobility and migration).

### 6.5 The urban share (P4)

The province urban share becomes Σ urban persons ÷ persons, changing only through mobility,
migration and births and deaths; it feeds the P4 urban terms (fertility, the urban mortality
penalty, sanitation) as today. No target from HYDE or WPP is read after 1900.

---

## 7. Mobility acceptance: the growing no-input economy

A fixture (no player actions, no AI) with one territory, a peasant sector on limited land and a
capitalist sector whose owners reinvest through E3 construction of the existing buildings (no new
mechanics): as industrial buildings are added and peasant marginal product falls with population,
wages in town exceed the peasant alternative, vacancies pull peasants into laborers and
attendants, and the agricultural employment share (peasants, farmers and farm laborers ÷
employed) falls year on year. A second fixture holds labour demand fixed while the labour force
grows: unemployment rises and wages fall. Both are deterministic and run in the test suite.

---

## 8. The fibre good (Q15, Q16) — deferred

**Deferred by the designer on 2026-11-08: not resolved in this plan and not in the implementation
order (§15).** The analysis below is kept for when the question is taken up. P7's measured incomes
change clothing demand, so the cotton ratio of §8.3 is re-measured and reported at the close of P7.

### 8.1 Goods and buildings

- **Good 60 `bast-fibre`** (flax, hemp and jute fibre, kg; storable, tradeable; reference price
  from the 1900 New York jute price already transcribed, $0.0435 a lb (BLS Bulletin 39), and
  flax and hemp prices to transcribe, weighted by 1900 output).
- **Building `fibre-farm`** (agriculture, land-using, farmers or peasants and laborers): bast
  fibre per hectare from 1900 yields (provisional until transcribed), placed at sourced 1900
  output by country.
- **Building `bast-fibre-mill`** (textiles): 1.15 kg fibre per kg of cloth (the P2b mass balance),
  labour as the textile mill, placed at sourced 1900 bast spinning by country; makes the existing
  `textiles` good. The textile mill and the acceptance test's lines are unchanged.

### 8.2 Sources (each checked for licence; public domain unless noted)

Flax and hemp: Webb 1911 and Mulhall 1899 (cached), USDA fiber investigations (Dodge, 1892 and
1897), the International Institute of Agriculture's first yearbook (1910) for country output
around 1900–1909, Russian and Italian agricultural yearbooks where reachable. Jute: *Agricultural
Statistics of British India* and the *Review of the Trade of India* for 1900–01, Webb 1911 (jute
area and crop). Mills: Census of India 1901 and Dundee and Belfast trade returns in the Board of
Trade abstracts (cached `bot-foreign-abstract-29`, colonial abstract). Downloads go to their own
new empty folders under `.cache-p7/` (added to `.gitignore` first).

### 8.3 Expected cotton and wool ratios

Today modelled cotton is 1.45 × the 1900 world lint (3,446 million kg), i.e. 4,997 million kg. Each
kg of bast fibre made into cloth replaces 246.667 ÷ 275.4 ÷ 1.15 = 0.779 kg of cotton, so

  cotton ratio ≈ (4,997 − 0.779 · B) ÷ 3,446, with B the bast fibre spun (million kg a year).

The band 0.85–1.15 is met for B between about 1,330 and 2,650 million kg. World flax, hemp and
jute output around 1900 is of that order (to transcribe; jute alone was well over a million tonnes),
so Q16a may land near the lower edge; flax and hemp alone (Q16b) may not reach the band. P7's
measured incomes (Q18) also move clothing demand, so the ratio is re-measured after both changes.
Wool: the textile mill's output falls with its cotton, so the mills' wool demand falls by the same
factor; wool covers 25 % of mill demand today and about 36 % if cotton falls to 1.0 (the wool
shortage remains a reported item).

---

## 9. Effect on the 1900 calibration and the P6 carry-overs

### 9.1 Generator

`scripts/p7/build-labour-1900.mjs`, chained after `build-goods-1900.mjs` and `scripts/p6`, with
`--check`: professions (sixteen) and participation; 1900 occupation shares (§3.3); job-slot and
owner remap (§3.4); institution slots; 1900 wages; incomes and
placement iterated (§9.2); reports `docs/P7_BEFORE_AFTER.md` and `docs/P7_LABOUR_PROVENANCE.md`
(licences and attribution of every P7 source row). The P2 profession split and the P4 urban-share
order read the new settlement column.

### 9.2 Incomes (Q18)

Fixed point: incomes → LES demand → placement (D-146 A5) → employment by the day-1 rule → incomes,
until the largest change in any territory's income is below 0.5 % (or ten rounds; reported).
Owner income = the placed buildings' value added less wages and upkeep, distributed by M5a.

### 9.3 Carry-overs

| Carry-over (P6 §7) | P7 treatment | Expected |
|---|---|---|
| Cotton 1.45× (P5b acceptance test) | deferred (Q15, Q16) | re-measured after P7's incomes; the test stays failing and is reported |
| Blocks without covered jobs (clerks, capitalists, academics) | Q4 institution slots; attendants and clerks in services; owners paid through profits | uncovered only for unpopulated professions and for real unemployment |
| Poor countries' lower classes below subsistence | measured employment and wages, peasant work-sharing | fewer; any left reported by country |
| 1900 food gluts (grain, produce) | commercial farms shed labour when R < 1; peasants do not | smaller gluts; reported from the long run |
| Estimated 1900 incomes | §9.2 | replaced |
| No long run | Q22 | ten years reported |
| Migration ignores housing | §6.3 | done |

### 9.4 Hash and known answers

The 1900-world hash is re-pinned by design after the designer reviews the before/after report,
with the reason in the test. Legacy known answers get encoding-only proofs
(`packages/tests/src/fixtures/p6Encoding.ts` pattern) where P7 adds fields.

---

## 10. Schema, saves, protocol and data versions

- **World schema 34 → 35; simulation 0.30.0 → 0.31.0; data `m3-economy-v14` → v15; worker
  protocol 23 → 24.**
- **State:** `World.labourMarket` (per territory × profession: reference wage, last month's u and
  v; per province × profession: differential); `BuildingInstance.staffingCeiling`;
  `World.nextPopBlockId`; `EmploymentAssignment.employer` (building or institution); monthly
  mobility and migration totals in the bounded history; `ProvinceEconomy.wageRUSDPerYearByProfession`
  removed. Definitions: `ProfessionDef.roles`, `entry`, `settlement`, course length, entry capital;
  `LawDef` minimum-wage `coverage` (farm employees, domestic service) and the compliance exponent;
  the labour-market coefficients in `economy/constants.ts` with units, justification and status.
- **Serialization:** column tables for the new records (typed arrays where dense); sparse when a
  world has no labour market (legacy).
- **Saves (Q20):** schema-34 saves listed as incompatible with the reason (D-120).
- **Validation:** finite positive wages; differentials' weighted mean 1 within tolerance;
  ceilings in [0, 1]; one job per worker across buildings and institutions; population, literate
  persons, cash and dwellings conserved by every flow; created ids unique and above all existing;
  retired blocks hold nothing.

---

## 11. Phone UI (protocol 24) and performance

### 11.1 UI

Reference 844 × 390 points, landscape, 44-point controls, no hover; colour, type and layout only
from `packages/app/src/design/tokens.ts`; the map stays mounted and panels slide over it; one code
path for web, iOS and Android.

1. **Labour screen, new "Labour market" section** (country): one row per populated profession —
   workers, unemployment rate, vacancies, wage in the display currency with last month's change —
   in a `Disclosure` list; above it the agricultural employment share and the urban share. The
   existing minimum-wage control gains the §4.5 preview (covered workers, workers paid below the
   proposed floor, jobs at risk, compliance), labelled a short-run estimate.
2. **Population screen:** the sixteen professions grouped (rural, manual and service, military,
   office and commerce, professional, state and church, owners) with persons; a "Mobility this
   month" disclosure (net flows by profession, people created and retired blocks).
3. **Province panel:** employment and unemployment by profession, the province wage index, urban share.
4. **Map lens "Unemployment"** through the existing province-lens path; a 44-point chip like the
   Crowding lens. `pnpm map:atlas` after the map change.
5. **Snapshot:** per-territory profession rows and a per-province unemployment and urban-share
   array; the size estimate is reported against the bound.
6. **Playtest** (extended): the Labour market section renders with figures, the Population groups
   and mobility rows, the province panel rows, the minimum-wage preview, the Unemployment lens
   colours the map, 60 goods counted (no new good while the fibre good is deferred); no console
   errors at 844 × 390.

### 11.2 Performance (designer's hold)

Blocks rise from 5,687 to an estimated 12,000–16,000 (13 populated professions; the ceiling is
1,687 × 16 = 26,992; D-117 expected about 8,000 with nine). Monthly mobility adds a pass over
blocks and targets. Under the hold I will not run `pnpm bench`, perfPhases or perfBench, nor
optimise; they are reported as skipped at the designer's request. Counts (blocks, flows, rows) are
reported from the tests and the long run without timing.

---

## 12. Tests

Tests first where practical; every coefficient has a unit test of its formula.

1. **Wage rule:** territory and province updates; asymmetry; price term; differentials' mean 1;
   floors bind and release; **acceptance:** unemployment lowers wages (§7 second fixture).
2. **Hiring:** ceiling moves with R; layoffs when R < 1, hiring when R > 1; subsistence exempt;
   idle buildings re-evaluated; institution slots = funding ÷ wage; one job per worker.
3. **Mobility:** pressure and bounds; netting; demotion; selective literacy conserves literate
   persons; training capacity and cost postings balance; capital gate; closed entry.
4. **Reclassification (acceptance, people conserved):** creation and retirement over many months
   of a fixture and of the 1900 world: population, cash, literate persons and dwellings conserved
   for every block, province and the world; ids unique; retired blocks empty; ownership passed.
5. **Urbanisation:** settlement of movers; province urban share from counts; housing factor lowers
   inflow; dwellings follow §6.4.
6. **Agricultural share (acceptance):** §7 first fixture, falling year on year.
7. **Determinism and replay:** identical hashes for two runs and through the rollback runner,
   with mobility and creation months inside the replay window.
8. **Save round trip (acceptance):** schema 35 encode → decode → identical hash, including created
   and retired blocks, wages and ceilings; schema 34 rejected with the D-120 message.
9. **Minimum wage (§4.5):** a floor above R's break-even lowers the staffing ceiling of the
   least productive covered buildings first; one national floor raises unemployment more in a
   low-wage province than a high-wage one, and migration then moves people toward the high-wage
   one; uncovered work (peasants, self-employed, excluded sectors) is never floored and gains
   movers; the paid wage follows compliance × administration quality; institution slots fall with
   the floor; the preview's jobs at risk equal the slots whose R at the proposed floor is below 1;
   unrest reads the labour-market unemployment rate. The P5b cotton test is not counted: it stays
   failing while the fibre good is deferred.
10. **Generator:** `--check`; every P7 parameter traces to a source row or is marked provisional;
    the income fixed point converges.
11. **Legacy path (Q21):** existing M2–P6 suites pass unchanged.
12. **Worker and UI:** protocol 24 snapshot fields; bound; playtest.

---

## 13. Contradictions and proposed resolutions

1. **GDD §6.2 and §17J.3 "nine professions"; program P7 "all nine GDD professions".** Replaced by
   sixteen (Q1, designer). Resolution: amend §6.2 with the table of §3.2 and the role principle;
   D-154.
2. **GDD §6.7 / D-052 national labour access.** Replaced by own-province work plus migration (Q5).
3. **D-052 "no migration block is created", same-profession only.** Superseded for labour-market
   worlds by §5.4 (D-117 already foresaw creation).
4. **D-078 item 9 (health by clerks) and item 3 (instructors from one academic pool).** Superseded
   by Q3 and §3.4.
5. **D-135 static province wage tables; GDD §7.7 "wage index … not implemented".** Replaced by §4.
6. **D-142 item 7 (urban share fixed until P7; urban people to clerks, laborers, academics and
   capitalists first).** Superseded by §3.3 and §6.5.
7. **Fiscal administration payroll paid by population to every admin-profession block** (double
   employment against GDD §6.7). Resolved by Q4.
8. **D-117 "about 8,000 blocks".** Recorded with the new estimate (§11.2).
9. **GDD §9.1 membership by profession.** Unchanged in form; weights remapped (§3.5).
10. **Program "the textile mill recipe" for the fibre good.** Q15 proposes a separate mill so the
    P5b test is untouched; the question is deferred by the designer.
11. **Program P7 acceptance "the P5b cotton test passes".** Not reachable while the fibre good is
    deferred; resolution: the program's P7 entry records the deferral and the test stays failing,
    unchanged.
12. **D-078 / GDD §17A.9.1 "employment quantity is not wage-elastic in E5".** Removed by §4.3 and
    §4.5: the floor now acts on employment, coverage and compliance.
13. **The unrest unemployment term** (`politics.ts`: 1 − employed ÷ working-age persons) counts
    people outside the labour force as unemployed. Resolution: the labour-market unemployment rate
    (unemployed eligible ÷ eligible labour force); the 1900 unrest residual is re-measured.

---

## 14. Risks

- **Calibration shift.** Sixteen professions, measured incomes and local labour markets change
  every placement. Mitigation: before/after per country; designer review before the hash re-pin.
- **Source coverage.** Census occupation tables with employment status exist for perhaps twenty
  territories; the rest are proxies. Reported per territory.
- **1900 disequilibrium.** Local matching (Q5) and the hiring rule may open unemployment and
  vacancies on day 1 that mobility then closes; the long run shows how fast. Reported.
- **Dynamics.** Wage, ceiling and mobility coefficients are provisional; oscillation is possible
  (wages and staffing chasing each other). Tests bound monthly changes; the long run is the check.
- **Performance** (§11.2).

---

## 15. Implementation order after approval

1. **Sources:** `.cache-p7/` (git-ignored first); occupation tables, 1900 wages of the new
   professions, the minimum-wage coverage example; `packages/data/data/historical/p7/sources_1900.json`
   with licences. (Flax, hemp and jute wait for the fibre decision.)
2. **Simulation, tests first:** profession roles and validation; the reclassification operation
   (creation, retirement); labour-market state and the wage rule; floors; staffing ceilings and
   work-sharing; own-province access; institution employment; mobility and migration with housing;
   urbanisation; selective literacy and training gates; the minimum wage's coverage, compliance and
   preview (§4.5); the unrest unemployment rate; schema 35; the legacy path. `pnpm test`
   (background) and `pnpm typecheck`. Commit.
3. **Generator and data:** sixteen professions; remaps; occupation
   shares; wages; the income fixed point; placement; reports; data v15; province scenario, P2b and
   P5 `--check`s, worker scenario and app worker bundle rebuilt. Designer review of the before/after
   before the hash is re-pinned. Commit.
4. **Protocol 24, snapshot, UI; `pnpm map:atlas`; playtest extended.** Commit.
5. **Long run** (background), `pnpm test`, `pnpm typecheck`, playtest, `pnpm app:export`; D-154 and
   later numbers in `DECISIONS.md`; program and GDD status lines; completion report with the
   consolidated unresolved items. Benchmarks skipped at the designer's request.
