# Statecraft Program — the game on top of the simulation

**Status:** **approved by the designer on 2026-11-16**, with all ten decisions of §18 as
recommended. Nothing is implemented yet. Stage S0 records the approval in `DECISIONS.md` and revises
the GDD; until then, where this program and the GDD disagree, this program applies (AGENTS.md §8).\
**For implementing agents:** read `docs/statecraft/README.md` first. It leads to the handbook, the
shared contracts and the brief of each stage.\
**Scope:** everything after P7: military, politics, diplomacy, interface, technology, country AI,
news, the road to a Great War, religion and heritage, performance, the remaining Prosperity stages
(P8 to P15) and the open items of the P7 close.\
**Premise (designer, 2026-11-16):** free to rethink everything, including the GDD, the tests and
the existing code.\
**Goal:** a grand-strategy game for phones in which one causal world of people, goods, money and
power carries the economy, society, diplomacy and war, and in which the player always knows what is
happening, why, and what can be done about it.

Contents: 1 where the build stands · 2 the game · 3 what stays, changes, goes · 4 the Clockwork
(200 ms day) · 5 economy · 6 heritage and faith · 7 politics · 8 diplomacy and the Great War ·
9 war · 10 technology · 11 country AI · 12 the Gazette · 13 interface and game feel · 14 roadmap ·
15 how every stage is built · 16 known problems and where they land · 17 risks · 18 decisions needed

---

## 1. Where the build stands (2026-11-16)

| Area | Today | Evidence |
|---|---|---|
| World | 1,687 provinces, 20,741 population blocks with single-year ages, 61 goods, 63 customs territories, 66 selectable countries, double-entry money, sourced 1900 data | P2 to P7 reports |
| Day speed | Ordinary day 929 ms, month mean 1,082 ms, worst day 4,167 ms (the monthly labour phase); the published day is 1,358 ms because the snapshot adds about 285 ms. Reference desktop, Node | P7 report §4.1, D-161 |
| Long run | The economy does not hold: in ten years unemployment goes 2.6 % → 25.2 %, 99 % of the lower stratum is below subsistence from 1905, population falls 8.4 %, textile output falls to a fraction | P7 report §4.2 |
| Military (M10) | Five actions; armies are rosters; hostile armies in one province fight daily; equipment comes from a non-simulated supplier; no supply, terrain, navy or air; the AI never declares war or recruits | GDD §17H |
| Diplomacy | Wars, truces and peace offers only; no treaties, alliances, subjects, crises | GDD §17H.7 |
| Politics (M8) | Three regime templates, seven interest groups, twenty laws in four active slots, three scripted events | `politics.json` |
| Technology (M9) | 125 technologies; 74 are flat sector-productivity bonuses; one project per country | `technology.json` |
| Country AI | The planner sets the income tax and the welfare budget, nothing else | `economy/ai.ts` `planCountryActions` |
| Interface | A good map and shell (Living Atlas); thirteen ledger screens behind four domain buttons; the HUD shows treasury, people and hardship; nothing asks the player for a decision | `GameShell.tsx`, screens |
| News | None (a status line and dispatch names) | — |
| Heritage, religion | None; Clergy exists as a profession | P7 |
| Development loop | Full test run 101 minutes (114 suites, 1,483 tests); a ten-year run 75 minutes | P7 report §5.1, §4.2 |

Three conclusions shape the plan:

1. **The simulation is deep and the game is thin.** There are levers but no goals, no opposition
   and no drama. The world outside the player's country barely acts.
2. **The economy must hold before anything is built on it.** It is the first stage.
3. **The day costs five to six times the target, and it spikes.** Stages D-157 to D-161 made the
   same work 2.7× cheaper and left a flat profile. The remaining factor has to come from doing less
   work per day, not from doing the same work faster.

---

## 2. The game

### 2.1 Why this can be better than Victoria 3 and Hearts of Iron 4

Victoria 3 simulates society and the economy well, but its wars are hands-off, its diplomacy is
thin, its loop collapses into a construction queue and it gives little direction. Hearts of Iron 4
makes war and war production absorbing and gives direction through focus trees, but its economy and
people are abstractions, its politics are points to spend and its peace conferences are weak.
Neither runs on a phone. Fabric of Nations can beat both on five things:

1. **One world.** The soldier is a person who left a job in a province. The shell is steel that a
   mill made. The war loan is a bond that someone bought. Mobilisation, blockade, inflation and
   revolution are the peacetime economy under strain, not a second rule set. Neither reference game
   joins these.
2. **Legibility as a feature.** Every figure answers "why?". Every decision shows a forecast.
   Later the game reports how the forecast held.
3. **A world that acts.** Other governments have aims, alliances and crises, and they state their
   reasons.
4. **Built for the phone.** Sessions of five to twenty minutes, an agenda of decisions, and
   "advance to the next decision".
5. **Determinism as a product feature.** Seeds can be shared, challenges compared and a campaign
   replayed as a chronicle.

### 2.2 Pillars of play (added to the six design pillars of GDD §1.2, which stay)

| Pillar | Meaning | How it is checked |
|---|---|---|
| A decision a minute | At default speed a meaningful choice arrives every 60 to 90 seconds, never more than three minutes apart | Playtest log: decisions per minute, longest idle stretch |
| Every number answers "why?" | No figure on screen without its causes and its levers one tap away | Audit test over the view registry |
| The world acts | Every system the player can use, the AI uses | AI coverage test per action |
| Consequences have faces | Effects land on places and people: the province that lost its class of 1896, the minister who resigned | Each stage ships its place-sheet rows and Gazette events |
| Nothing is a meter to spend | The No-Mana doctrine stays; it is the game's identity | Existing rule and audits |

### 2.3 The loop, at five time scales

| Scale | What the player does | What closes the loop |
|---|---|---|
| Minute | Answers the Desk: decisions and reports from the cabinet, crises with clocks | The forecast, then the result |
| Session (10 to 20 minutes; one to three years of peace, weeks of war) | Finishes something: a law, a railway, an offensive | The monthly report is the natural stop |
| Mandate (4 to 7 years) | Keeps or breaks the promises made to the coalition in power | Election, or the consent of the regime's pillars |
| Era (15 to 25 years) | Pursues national ambitions | Era review: power, prosperity, liberty, stability against history |
| Campaign | Writes an alternate twentieth century | The chronicle |

### 2.4 Ten minutes as Italy, September 1911

The Gazette leads with France and Germany locked over Morocco. The Desk holds four cards. The
foreign minister sees a window in Libya: the Ottoman garrison is weak and the powers are busy; the
forecast lists each power's likely answer with its reasons, the cost of an expedition and what the
navy can carry. The finance minister wants the grain tariff renewed: the landowners in the
coalition demand it, and the "why" on bread shows what it costs labourers in the south. The war
minister reports the class of 1891 and a shortage of 40,000 rifles: order from the Terni arsenal,
or buy abroad. A strike has begun in Milan. The player decides each one, pins two of them to the
decision journal, sees on the Timeline that the ultimatum expires in nine days, and advances to
the next decision.

### 2.5 Non-goals of this program

No unit-level micromanagement and no tactical battles. No spendable points of any kind. No scripted
history: history supplies starting conditions and calibrated pressures. No multiplayer (determinism
keeps the door open). No language model at run time; all text comes from data templates.

---

## 3. What stays, what changes, what goes

**Stays.** Determinism and keyed randomness. The No-Mana doctrine. Exact conservation of people,
goods and money. The isolated simulation (ES2022 library only). The interface reads snapshots, never
the world. Mobile first: landscape, 844 × 390, tokens, 44-point controls, one code path. Data
provenance. No legacy saves. One thread (D-163).

**Changes** (each amends the GDD and needs approval; §18 lists them as decisions):

1. **Cadence.** GDD §3.4 makes production, consumption, wages and prices daily. They become weekly
   market rounds; demography and labour become monthly. The day stays the calendar tick and the
   cadence of war (§4).
2. **Regression method.** Hash pins of the 1900 world stop being the main guard, because every
   model change re-pins them (D-165, D-167). The guards become: invariants and conservation;
   replay and save equality within a build; statistical envelopes from the Observatory (§15).
3. **Accounting granularity.** Postings per block per day become weekly journals per account class
   and cohort. The identity and conservation rules do not change.
4. **Snapshots.** A full snapshot per day becomes subscribed views with deltas (§4.4).
5. **Prosperity stages.** P9 to P13 compress into two stages; P14 is absorbed by this program's
   news, goals and AI; P15 becomes continuous through the Observatory (§5.2).
6. **The GDD.** It is 6,992 lines, most of them implementation records. S0 replaces it with a
   design bible (what the game is, the binding rules, one specification per system) and archives
   the records.
7. **Tests.** One 101-minute run becomes three tiers (§15).

**Goes** (deleted when its replacement lands): the M10 military code; the flat-bonus technology
data; the M6 planner; the three scripted political events; the full-snapshot protocol. Candidates
to confirm by inspection in S2: the staged tick mode next to phase mode, and per-piece transaction
detail.

---

## 4. The Clockwork — a day in 200 ms

### 4.1 Where the time goes (D-161, ordinary day, ms)

Market clearing 199 · household demand 141 · settlement 109 · demography 103 · needs 44 ·
employment 40 · fiscal 38 · education 36 · production demand 36 · trade dispatch 30 · training 25 ·
politics 21 · unrest 20 · others 48. Outside the tick: snapshot about 285. Once a month the labour
phase makes one day cost about 4,170.

Almost none of this needs daily resolution in a game that spans a century. The household demand
alone is 460,000 rows a day.

### 4.2 Principle

Each process runs at the cadence its dynamics need, and the work is spread so that no day is heavy.
A scheduler owns the day's budget: every job is registered with a wheel, a slot and a measured cost,
and the benchmark fails when any day of the reference world exceeds its budget.

### 4.3 The wheels

| Wheel | Slots | What runs |
|---|---|---|
| Day | every day | Calendar, dated events, crisis clocks, construction progress, war (movement, supply, combat), one slice of country AI, view deltas |
| Week | 7 | Each customs territory has a market day. On it the territory runs one round for the week: production and extraction, household and firm demand, clearing, the price step, wages, profits and taxes, trade dispatch. Shipments are dated, so territories with different market days trade through goods in transit |
| Month | 28 (days 29 to 31 are light) | Demography (the month's births and deaths), labour market, mobility and migration, education and health, beliefs and movements, assimilation and conversion, unrest; the month's accounting close |
| Year | 52 | Ageing (1 January, a block move), annual accounts, strategic reviews of the AI, treaty reviews |

Slots are assigned once per scenario from stable ids and measured cost (the largest territories on
different market days), so the schedule is deterministic and identical on every device. Contractual
amounts (interest) are computed in closed form for the days elapsed at the next posting.

### 4.4 Doing less work

1. **Demand by cohort, not by block.** Blocks in one territory that share an income bin face the
   same prices and the same demand parameters, and the linear expenditure system is linear in
   income. Their demand can be summed, cleared once and apportioned back in proportion. Within a
   bin this is exact; the binning error is measured against the per-block solution in a test.
   Expected: two orders of magnitude fewer rows in demand, clearing and settlement.
2. **Weekly journals.** One posting per account class, cohort and week.
3. **The labour month.** Sliced by territory over the month wheel, and profiled first: 4.2 s in one
   pass is the largest single item in the build. Budget: 600 ms a month in total.
4. **Views, not snapshots.** The interface subscribes to the views on screen. The worker computes
   only those, at the cadence their data changes (HUD daily, a market view on market day,
   demography monthly) and sends deltas. This replaces the 2,630-line snapshot builder and most of
   the 3,865-line protocol with a view registry, which the "why" audit of §2.2 also uses.
5. **Columnar state for what is left as objects, and binary columnar saves** (the 1900 save is
   about 10.1 M characters today).
6. **Pooled stock** per market, good and holder class, unless a system needs a lot's origin (D-165
   counted 163,066 dust lots in 53 days).

### 4.5 Budget (reference desktop of D-161, worst day)

| Item | ms |
|---|---:|
| Day wheel without war | 10 |
| War (15 at peace, 35 in a world war) | 35 |
| Market day (the territories whose day it is) | 50 |
| Month slot | 35 |
| Year slot | 5 |
| Country AI slice | 15 |
| View deltas | 15 |
| Spare | 35 |
| **Total** | **200** |

Mean day: 120 ms or less. These are targets; the estimates behind them come from the D-161 table
and are measured in S2.

### 4.6 Not doing

No threads (D-163). No WebAssembly for now: it adds a second language and toolchain, and it is
measured only if the budget is missed after §4.4.

### 4.7 Acceptance of S2

- Worst day ≤ 200 ms and mean ≤ 120 ms over 1900 to 1902, view deltas included, with the load map
  (which job on which day) in the report. Ten-year run ≤ 15 minutes.
- People, goods and money conserved exactly through every wheel; replay and save round trip equal.
- The weekly world tracks the daily world: over three years the yearly aggregates (output by good
  family, consumption per head by stratum, price indices, employment by profession) stay within a
  stated tolerance of the S1 build, with each difference explained.
- Memory of the simulation context reported against a budget (today: 86 to 88 MiB heap and 172 to
  195 MiB of array buffers). Phone speed and memory are the designer's to test.

---

## 5. The economy: make it hold, then make it grow

### 5.1 S1 — a stable economy (before anything else)

**Method.** Diagnose, then fix structure, never coefficients first (GDD §6.6). One simulated year
takes about 7.5 minutes today and the collapse shows within the first (77 % below subsistence by
1901), so one- to three-year runs are enough. The instrument is a monthly flow-of-funds table: cash
by holder class, saving against investment, the lower stratum's income by source, labour flows by
profession.

**Hypotheses, in the order to test them, each with its structural fix:**

| # | Hypothesis | Evidence so far | Fix |
|---|---|---|---|
| H1 | Saving has no way back into spending. Households and owners save, but firms and banks do not exist yet, so cash piles up, demand shrinks and prices sink to their floors | Produce at its floor from 1902; purchases fall while output does not | A minimal investment closure now: owners reinvest retained profit in capacity where the margin is positive; household savings are deposits that fund it. This is the seed of S10 and S11, not a coefficient |
| H2 | Nothing replaces a lost wage. A block has one cash account, so its employed members already carry its unemployed, but there is no informal work and no relief | P7 report: relief and sharing are small or absent | The Lewis fallback: informal and subsistence work that produces real goods or services at low productivity, and poor relief as a law with 1900 data |
| H3 | Mobility overshoots. It already uses expected income (wage × (1 − unemployment) × housing), but at the 1900 gap (peasant 174 against laborer 1,273 RUSD a year) the flow stops only near 86 % unemployment, and 5 % of the destination's labour force may arrive ahead of jobs every month | Peasants 198.6 M → 88.3 M while a third of laborers are unemployed | Compare incomes on one basis (own consumption in kind, rural against urban prices); arrivals tied to vacancies; a return flow |
| H4 | Supply ignores gluts | Stocks of thousands of days at the floor price | Producers cut output and labour above a stock-cover target; perishables spoil; price floors removed or justified |
| H5 | Salaried professions are over-entered | Bureaucrats 4.7 M → 30.5 M, clerks 58 % unemployed | Entry against vacancies; H3's expected income |

**Also in S1:** the first week of the United States market (ten imported goods without sellable
supply, D-167); the 61 Russian and 13 Italian cotton mills left unplaced (D-166); the flax, hemp
and ramie coverage gaps (D-166); the yearly demographic record written after the year's last
checkpoint.

**Acceptance.** A 25-year run without player input: outside war and famine, less than 15 % of the
lower stratum below subsistence; births above deaths in the countries that grew; unemployment
between 2 % and 12 %; textile output rising; no price pinned to a bound for more than a year; world
product per head reported against Maddison's 1.3 % a year (1870 to 1913). The bands are provisional
and recorded with the result.

### 5.2 The Prosperity agenda after P7, and where it goes

| Prosperity item | Lands in | Change from the Prosperity plan |
|---|---|---|
| P7 long-run collapse, US first week, unplaced mills | S1 | — |
| P7b save storage | Done (D-170) | Binary columnar saves in S2 |
| Map-pipeline repair | P7 close (step 8) | — |
| P8 infrastructure and market access | S9 | Adds merchant shipping as real tonnage; railways also set mobilisation speed and army supply |
| P9 companies, P10 private investment, P12 state and mixed ownership | S10 | One stage |
| P11 banks, credit, bonds, monetary gold and silver; P13 stock exchanges | S11 | The exchange is reduced to share prices of listed firms, an index and trust formation; no order book |
| P14 story layer | S4 to S8 | Reports, news, goals and AI become first-class systems |
| P15 century calibration | S3 onward, final pass in S27 | Continuous through the Observatory |

**Firms (S10).** A firm owns buildings in one industry and territory, keeps a balance sheet, invests
where the expected return beats the interest rate, and closes or goes bankrupt. Firms have names
(the known houses of 1900 from data, generated otherwise). The state can own, subsidise,
nationalise with compensation in real money, and privatise. The player does not run firms; the
player sets their conditions: tariffs, taxes, credit, infrastructure, schooling, concessions to
foreign capital. Firms give the economy faces, give the capitalists' interest group its real
wealth, and become the arms contractors of §9.

**Finance (S11), designed for drama.** Banks turn deposits into loans; the interest rate is
emergent; the credit cycle produces booms and panics (1907, 1929 become possible, not scheduled);
the gold standard constrains; wars are financed by taxes, bonds and the press; reparations are debt
contracts. Sovereign debt is leverage in diplomacy (§8): creditors' fleets and debt administrations
existed in 1900.

---

## 6. People: heritage and faith

**Rules.**

1. No group has inherent traits. Every difference comes from conditions, law and institutions.
2. Composition, not keys. A population block stays province × profession × settlement and carries
   counts of people by heritage (a short sparse list plus a remainder) and by faith. Movers carry
   their composition; births inherit it; people are conserved exactly, as everywhere else. The two
   are separate margins; where faith divides identity, the heritage groups are drawn finely enough
   to carry it.
3. The interface says **heritage** and **faith**. Legal status by group is modelled because the
   century cannot be told without it; the game presents it soberly and never rewards persecution
   with a bonus.

**Data.** About 300 heritage groups in a three-level tree (family, branch, group) and about 30
faiths in two levels, per province for 1900. Sources: the censuses nearest 1900 (Russia 1897,
Austria and Germany 1900, Hungary 1900 and 1910, United States 1900, India 1901, the Ottoman count
of 1905–06), with later ethnographic data as a fallback marked provisional. A generator with
provenance and a `--check` mode, like P2, P4 and P7. Sourced first: Europe, the Ottoman Empire,
India and the settler countries.

**Mechanics.**

| Mechanic | Model |
|---|---|
| Legal status | Laws on citizenship and franchise, the language of schools and offices, church and state, access to land and professions, colonial subject status. They change wages, schooling and political rights for the groups concerned |
| Assimilation and conversion | Slow monthly flows from school language, urban life, minority share and state pressure (which also raises resistance). Secularisation follows literacy, towns and ideology |
| Institutions of faith | The Clergy staff parishes, schools and relief: real services paid by tithes, endowments or the state, and a pillar in politics |
| Homelands and claims | Claims are computed, not authored: a state whose heritage has kin majorities abroad holds an irredentist claim; a group without a state seeks one; pan-movements tie a great power to its kin. Claims feed disputes, war aims and plebiscites (§8, §9) |
| Migration | Destinations are weighted toward kin communities; persecution drives emigration |
| The army | Units are raised from provinces and carry their composition; cohesion follows the status of those groups |

**Lenses.** Heritage, faith, legal status, national mobilisation, claims. **Cost.** Monthly; nothing
daily.

---

## 7. Politics

The chain: conditions → beliefs → organisation → power → law → conditions.

1. **Beliefs.** Each block holds support shares for four ideologies (liberalism, traditionalism,
   communism, fascism), a radicalism level and an organisation level, updated monthly from
   documented causes. Communism grows with industrial labour, unemployment, falling real wages and
   the repression of unions; fascism starts near zero and has causes (national humiliation,
   veterans, a middle class whose savings were destroyed, fear of revolution); liberalism grows
   with literacy, towns and trade; traditionalism with rural life, faith and age. 1900 values come
   from election results where elections existed and from structure elsewhere.
2. **Stances from simulated interest.** A group's position on a proposal is its ideological fit
   plus the forecast effect on its own real income, security and status, computed by the same
   forecast the player sees. "Laborers oppose the grain tariff: bread +8 %." This replaces authored
   stance tables and makes politics legible.
3. **Organisation.** Interest groups (the seven that exist) lobby. Movements form around issues
   (suffrage, labour, national, confessional, peace). Parties are clusters of ideology and identity
   (names from data for the major countries, up to seven per country). Where there are no parties,
   factions: court, army, church, bureaucracy.
4. **Institutions as rules.** Who chooses the executive; whose consent a law needs (seats in a
   legislature, or pillars such as crown, army, church and landowners, or a party congress); the
   franchise; terms; rights of press, assembly and association. The regime's name is derived from
   the rules.
5. **The government.** Head of state, head of government and about eight ministers. They are
   characters: name, heritage, faith, party or faction, competence, loyalty, age. They age and die
   by the demographic hazard and resign over broken promises. Appointing them trades competence
   against the balance of the coalition. Ministers present the Desk's cards and run what the player
   delegates.
6. **Passing a law.** Draft → the regime's consent path → enactment time → implementation, whose
   quality depends on the administration. The player's tools are all real: concessions (a tracked
   promise of another measure or budget item), patronage (posts and money), timing (a crisis shifts
   stances because it shifts forecasts), a funded press, dissolution and elections, decree where
   the constitution allows, and repression, which lowers organisation now and raises radicalism
   later.
7. **Mandate.** Each government holds promises drawn from its coalition's leading demands. Kept or
   broken, they move support group by group, and with it elections, coalitions and coups.
8. **The ladder of instability.** Petition → strike (output lost in named buildings) → riot →
   general strike or mutiny → coup (officers' beliefs and pay) or revolution (organisation ×
   radicalism × the regime's weakness) → civil war (provinces side by support; fought with §9) or
   secession (a new polity is instantiated, which removes the "future polities" risk of the
   Prosperity plan). Each rung is visible in advance in the Stability lens, with causes.
9. **Who the player is.** The government of the day. After a lost election or an overthrow the
   campaign continues as the successor, with a new mandate, and the legacy records the fall.
10. **Laws.** About fourteen areas: executive and legislature, suffrage, rights and press, church
    and state, citizenship and language, taxation, trade, labour, welfare and relief, land,
    ownership, money, military service, police, colonial rule, migration.
11. **Regimes play differently.** Elections bind a liberal government and a free press tells it the
    truth. A traditional monarchy rules through its pillars. A communist one-party state owns the
    firms and plans output, and shortages show the cost. A fascist state is pushed toward autarky
    and expansion by its own base. The core arrives in S14; the planned economy and the one-party
    regimes in S24.

---

## 8. Diplomacy and the road to the Great War

### 8.1 The model

There is no opinion number to farm. Between two states stand: **interests** (declared stakes in
regions, straits and routes), **disputes**, **treaties**, **dependence** in trade and debt (already
simulated), **trust** (the record of terms kept and broken), **threat** (capability × proximity ×
signals of intent) and **kinship** (heritage, faith, the ideology of the regimes). The attitude on
screen is derived, with its components listed.

### 8.2 Treaties as lists of terms

Defensive or offensive alliance with its casus foederis; guarantee; entente; neutrality; military
convention; commercial treaty and customs union (which plug into the customs territories); loan and
concession (railway, port, mine, extraterritorial rights); subject relations (colony, protectorate,
dominion, mandate, with terms for tariffs, foreign policy and garrisons); arms limitation;
arbitration. Clauses can be secret and can leak.

### 8.3 Negotiation

A deal table: each side places terms. The other government answers with its reasons and with what
would change its answer: "We decline. Against: your guarantee of Serbia; our treaty with Germany.
For: the tariff schedule. We would accept with neutrality limited to the Balkans." Embassies are
staffed from the Bureaucrats and funded; the quality of what the player knows about a country
depends on them.

### 8.4 Great powers and prestige

Rank is derived from economy, industry, forces, fleet and alliances. Prestige is the estimate other
governments hold of a state's resolve and capability, moved by crises won and lost, wars and kept
commitments. It cannot be spent.

### 8.5 Crises and congresses

A dispute becomes a crisis when someone moves: an ultimatum, an occupation, an annexation, a
mobilisation, an incident. The crisis has a clock, sides and a ladder: demand → declared backing
(diplomatic, partial mobilisation, general mobilisation) → the offer of a conference → compromise,
backdown or war. Backing down costs prestige and support at home and leaves a grievance that
hardens the next crisis, which is how 1905, 1908 and 1911 led to 1914. Great powers can call a
congress on a crisis or after a war: positions on each term, weighted by stake and power.

### 8.6 The road to the Great War

Built from structure, never from a scripted declaration.

- **1900 data.** The alliances in force (Triple Alliance, Franco-Russian), declared interests, the
  open disputes (Alsace-Lorraine, the Italian irredenta, the Balkans, the Straits, Morocco, Persia,
  Manchuria and Korea, the status of Bosnia) and the subject relations.
- **Engines.** The security dilemma (arming raises the neighbours' threat). The naval race (tonnage
  ratios, reset by the dreadnought). The tightening of alliances. Imperial decay, which opens
  succession disputes where heritage politics weaken a state. Nationalism, whose radical movements
  produce incidents (keyed random events with a hazard from a province's movement). Mobilisation
  timetables: the first to mobilise gains weeks, the railway network sets the speed, and once a
  neighbour mobilises waiting has a measurable cost; this is what turns a crisis into a war.
  Windows: a power that forecasts its own relative decline accepts more risk.
- **Brakes.** Trade and credit interdependence, labour internationalism, arbitration, the memory
  of costly wars.
- **Calibration target** (History setting "Plausible"): in AI-only runs a war among four or more
  great powers begins between 1908 and 1920 in at least 75 % of seeds, median 1912 to 1916, and the
  line-up differs from history in at least a quarter of them. Measured over 50 or more seeds in the
  Observatory. Two other settings: "Faithful" (historical dispositions weigh heavily) and "Open"
  (nothing beyond the facts of 1900).
- **Agency.** The player can prevent it (conferences, détente, arms limitation), exploit it
  (neutral trade and loans; both blocs bid for a neutral's entry with promises of territory) or
  start it.
- **Visibility.** A Tension lens by region, the alliance web, the crisis clock, the Gazette's tone.

### 8.7 Later eras (Act VII)

Collective security as a treaty with votes; self-determination and mandates; reparations; blocs and
nuclear deterrence as a change to the crisis ladder; decolonisation from national movements and a
weakened metropole; international organisations.

---

## 9. War

**Principles.** Operational, not tactical. Orders are few and each one matters. The people and the
economy are the real ones. The character of war follows from technology and logistics, not from
scripted eras.

| Part | Design |
|---|---|
| People | Standing forces are the Servicemen and Officers professions. Conscripts are assigned from their home blocks and return to them. Reserves are the trained share of each birth cohort per province (single-year ages already exist: "the class of 1894"). Mobilisation calls classes; exemptions by occupation are the player's trade-off. Casualties are deaths in the home province's pyramid and stay visible for decades |
| Organisation | Armies (five to thirty for a great power) of divisions by pattern. A pattern is an establishment table (men, rifles, machine guns, guns, horses, later trucks and tanks) that the player designs on one sheet. Equipment is goods made by arsenals, shipyards and firms, or imported |
| Officers and doctrine | Officer quality comes from staff colleges and experience. One general per army or fleet, a character with a political reliability. Doctrine is learned from the war experience of surviving officers, from exercises (which cost money and shells) and from attachés who watch other wars |
| Fronts and operations | A front is the line between provinces under hostile control. Armies hold sectors with a posture. An operation is an objective, forces and preparation (stockpiling takes weeks and can be observed) → bombardment → assault → exploitation. The outcome comes from force ratio, firepower delivered (shells consumed are real stock), entrenchment, terrain, rivers, fortresses, supply, surprise, air superiority and officers, and is shown as a battle sheet with each factor's share |
| Supply | Depots, railway capacity (S9), ports, then horses or trucks. Supply is food, fodder, munitions and fuel physically consumed. Advances outrun their railheads and stall: the stalemate of 1915 emerges from firepower over mobility, and trucks, tanks and aircraft later reverse it |
| Occupation | A policy (lenient to extractive), a garrison, resistance from heritage and treatment; occupied resources and plants are used or stripped for real |
| Sea | About 120 sea zones (new map data). Fleets with missions: battle fleet, blockade, escort, raiding, transport, shore support. Ships are projects of years in shipyards. Blockade cuts the actual trade routes; merchant tonnage is real stock, and sinking it lowers trade. Submarines against convoys; later carriers |
| Air | From the 1910s, wings assigned to fronts and sea zones: reconnaissance (better artillery, revealed preparations), fighters, bombers. Strategic bombing destroys real buildings and infrastructure. Later missiles and nuclear weapons |
| War economy | A mobilisation law (peace, partial, total). Procurement contracts with firms (price, quantity, delivery; late delivery and profiteering become political). Conversion of plants to military methods takes time and costs civilian output. Rationing and price controls. Direction of labour and women in industry, with lasting social effects. Finance by taxes, bonds and central-bank advances, which inflate and erode savings |
| Home front | War support per block from the casualties of its own province, food, real wages, the news, the war aims, ideology and legal status. It produces strikes, mutinies by unit home region, pressure for a separate peace, revolution |
| Peace | War aims are declared at entry and are promises to the public and to allies. The conference weighs occupied territory, forces remaining and exhaustion, all derived and displayed (no war score). Terms: territory by province with optional plebiscites, new states, reparations as a debt contract, disarmament clauses, colonies and mandates, regime terms, guarantees. Terms leave disputes that seed the next war |
| Delegation | Any front can be delegated to the general staff with a directive (hold, press, main effort). It is the same AI the opponents use |

**War Room.** At war the interface changes mode: the map shows fronts, railheads, depots and army
badges. Tapping a sector gives force ratio, supply, entrenchment and the forecast of an offensive
as ranges of ground, casualties and shells. An operation is drawn by dragging from an army to an
objective; the Timeline shows its preparation. Losses are reported by home province.

**Cost.** Daily. Formations are armies and corps, about 1,500 worldwide at most; combat runs only
on active sectors (budget in §4.5).

---

## 10. Technology

**Today:** a tree of flat bonuses and a progress bar. **Proposed:** knowledge → know-how → use.

1. **Fields** (about twelve): metallurgy; chemistry; electricity; engines and vehicles; agriculture
   and biology; medicine and public health; construction; communications and computing; mining and
   energy; textiles and light industry; organisation (management, finance, statistics); military
   science.
2. **Inventions** (about 180 over the century). Each has a field, an earliest plausible date,
   prerequisites and what it enables: a production method, a new good, a building or infrastructure
   type, a type of equipment, a medical or sanitary effect, an institution.
3. **Frontier.** An invention is first made somewhere, by people: academics in universities,
   engineers in firms' laboratories and state arsenals, paid with real money. The monthly chance
   rises with qualified work in the field and with neighbouring knowledge; the draw is keyed. The
   interface shows a range ("likely 1906 to 1911"), never a date.
4. **Know-how.** Other countries acquire it by reading (literacy, universities, openness), by
   licence (real money to the inventor's firm), by hiring foreign experts, by students abroad, by
   foreign investment, by reverse-engineering imports and by espionage. The speed depends on their
   engineers and schools. Nobody re-invents everything; catching up is a strategy and isolation has
   a cost.
5. **Use.** Nothing changes until knowledge is embodied. Firms adopt a production method when it
   pays, which needs machinery and so investment (S10). The state adopts for railways, health,
   schools and the forces, which means re-equipping with real goods. Electrification is
   infrastructure to build.
6. **Production methods.** Each building type has a ladder in data, for example steel: Bessemer →
   open hearth → electric arc → basic oxygen, each with its inputs, labour by profession, output and
   capital. Technology then appears as changed jobs, goods and prices. Tractors free rural labour,
   so the move off the land has a cause instead of a schedule.
7. **New goods** (bicycles, motor cars, radios, appliances, television, computers) enter demand
   through the Engel system and create industries.
8. **Military technology is equipment.** A design project at an arsenal or firm produces a model
   whose figures follow from the inventions in hand; retooling takes time.
9. **Levers.** Funding and field weights of universities and institutes; the education pipeline
   that produces engineers and academics; patent and openness laws; missions and foreign experts;
   inviting or barring foreign firms; state programmes with their own staff and budget (the
   dreadnought, synthetic nitrogen, radar, the bomb, rockets); espionage.
10. **Interface.** A knowledge map: fields as rows, time as columns, the world frontier, the
    player's position, who leads, and the cheapest way to close each gap. Monthly cost only.

---

## 11. Country AI

1. **A government like the player's.** Each AI country has a government with a mandate, ambitions
   and a cabinet. It uses the same validated actions, sees only what its own embassies and
   intelligence provide and receives no bonuses. Difficulty changes foresight and error, never the
   rules.
2. **Three layers.** A *strategic review* (yearly and on shocks) weighs security, growth, welfare,
   prestige and ideology from the situation and the coalition's demands. *Ministries* (weekly,
   staggered) each propose actions valued on those weights with the same first-order forecasts the
   player sees: finance, economy, interior, education and science, foreign affairs, war. An
   *arbiter* chooses the best set that money and political consent allow, and commits to multi-year
   plans (a naval programme, a railway plan) with hysteresis, so it does not reverse itself every
   week.
3. **Character.** Dispositions come from the government (ideology, the leader's caution and
   ambition) and the country's position, with keyed randomness only for ties.
4. **Reasons on record.** Every AI decision stores its leading reasons. The player reads them in
   diplomatic answers, in the Gazette and in intelligence reports.
5. **The general staff** plans mobilisation, allocates armies to fronts by force ratio and
   objective, manages reserves and prepares operations. Player delegation uses it too.
6. **Scale.** Great and middle powers run the full cabinet; the smallest states a reduced one;
   subjects are administered under their overlord's colonial policy within the treaty's terms.
7. **Proof.** AI-only runs in the Observatory: defaults and bankruptcies within bounds, forces in
   proportion to means, growth near history, the Great War target of §8.6, and a league table of
   the new build against the previous one on fixed seeds.

---

## 12. The Gazette

1. **Source.** The simulation emits typed world events when state changes: treaties, crises, wars
   and peace terms; operations, battles, ships lost and cities taken; elections, governments, laws,
   strikes, coups, revolutions and deaths of leaders; panics, bankruptcies, price spikes,
   discoveries, great works and records ("German steel output passes Britain's"); famines,
   epidemics and migrations; inventions and first uses. A bounded log in the save is the campaign's
   chronicle.
2. **Editing.** The worker ranks events by magnitude, relevance to the player (own country,
   neighbours, allies, rivals, trade partners, creditors) and novelty, and writes a headline and
   two sentences from templates with the real figures and links to the place and the actors.
3. **Presentation.** A newspaper page in the World domain (front page, world, home, economy, war);
   a one-line ticker on the HUD; pins on the map; a "since you last played" briefing on resume and
   after fast-forward. Tapping a story flies the map there and opens the "why" behind it.
4. **The press law matters.** Under censorship the home pages print official figures, and what the
   player learns of unrest comes from the interior ministry instead, as good as its staffing.
   Foreign news is as good as the embassies.
5. **Chronicle.** The campaign as a timeline and a year-by-year book, exportable at each era's end.

---

## 13. Interface and game feel

### 13.1 The frame (the map stays the screen)

| Element | Place | Role |
|---|---|---|
| HUD | Top | Date and speed; four vital signs chosen by the situation (peace: treasury trend, living standard, stability, mandate; war: front, manpower, supply, war support); the Gazette ticker |
| Desk | Right thumb | A stack of cards: decisions with deadlines, crises with clocks, reports with their "why" |
| Timeline | Bottom strip, collapsible | What is coming and when: votes, elections, completions, launches, treaty expiries, ultimatums, the harvest. Drag to advance to a point |
| Time | Bottom right | Pause, a day a second (war), a week a second (peace), fast, "to the next decision"; the player's own auto-pause rules |
| Domains | Left thumb | Government, Economy, People, World, War. Each opens a sheet of at most four tabs and sets the map to its lens |
| Lenses | Map | About 25, grouped by domain, each with a legend and a one-sentence reading ("Bread is dearest in the south-east: poor railway access") |
| Place sheet | Over the map | A province or country in the terms of the active lens |

### 13.2 One grammar on every screen

**State** (the figure) → **Trend** (against last year) → **Why** (the leading causes with their
shares) → **Levers** (what can be done, each with a forecast) → **Track** (pin the decision).

### 13.3 The legibility engine

1. **Attribution ("why?").** Every indicator in the public contract declares its inputs. On demand
   the worker decomposes a figure into contributions: the share of each factor in a product, the
   largest sources and uses of a flow. It extends today's `explanations.ts` and costs nothing per
   day.
2. **Forecast.** Every action shows its immediate, first-order effect (today's previews, extended
   to all actions). "Ask the model" then runs the real simulation forward on a copy of the player's
   customs territory, with the rest of the world held at current prices and policies, with and
   without the action, and draws a fan chart for 6 to 24 months. It runs in the worker while the
   game is paused and is labelled with what it holds fixed. The Clockwork makes it affordable.
3. **Decision journal.** Each significant decision is stored with its forecast. At 3, 12 and 36
   months the journal reports what happened against it and the main reason for the difference.
   This is how the player learns the simulation and how the forecasts are kept honest.
4. **Codex.** "How it works" pages generated from the documented formulas and coefficients, which
   already carry units, justification and status, and linked from every figure.

### 13.4 Touch and feel

Sliders with snap values and live forecasts. Dragging on the map for operations and routes. A long
press on a province for the things that can be done there. Haptics on commit. Flows drawn on the
map: trains on built railways, convoys on routes, fronts that move. The four era skins already
designed (Imperial, Machine Age, Cold War, Digital) through tokens. Strings in tables from the
first stage, palettes safe for colour-blind players, a text-scale setting.

### 13.5 Onboarding

A guided opening of two years as a mid-sized country with one clear problem. The cabinet secretary
introduces one domain at a time through real Desk cards. After it, the 66 countries carry a
difficulty and a pitch ("Japan: catch up", "Austria-Hungary: hold together", "Belgium: stay
neutral").

### 13.6 Ambitions and staying power

- **Ambitions** are goals on real statistics: literacy of 90 %, a fleet at 60 % of the leader's
  tonnage, the eight-hour day in law, gold convertibility, the recovery of named provinces. The
  cabinet offers them from what the coalition and the situation demand. The reward is political
  support from those who wanted it and prestige abroad, both derived; there are no modifiers.
- **Open loops** are always visible on the Timeline.
- **Milestones against history**: "your Italy in 1913 and Italy in 1913".
- **Era reviews** score power, prosperity, liberty and stability; there is no single way to win.
- **Seeded challenges**: the same seed and start, outcomes compared. Determinism makes this cheap.
- **Clean stops**: the monthly report ends a session; an autosave follows it.

---

## 14. Roadmap

Sizes are relative to P7 (= L). Each act ends in a build that is a complete game for its scope.

| Stage | Content | Needs | Size |
|---|---|---|---|
| **Act I — Ground** | | | |
| S0 | Approval; decisions; the design bible replaces the GDD's records | — | S |
| S1 | A stable economy (§5.1) | — | L |
| S2 | The Clockwork (§4): wheels, cohorts, weekly journals, views, binary saves | S1 | XL |
| S3 | The Observatory and the three test tiers (§15) | S2 | M |
| **Act II — The game** | | | |
| S4 | Shell: HUD, Desk, Timeline, time controls, five domains, lenses, place sheet | S2 | L |
| S5 | Legibility engine: attribution, forecast, decision journal, codex | S4 | L |
| S6 | The Gazette: world events, newspaper, ticker, briefing, chronicle | S4 | M |
| S7 | Ambitions, a first mandate from the existing interest groups, era review, onboarding | S5, S6 | M |
| S8 | Cabinet AI for every existing lever, with reasons | S5 | L |
| | **Release 1 — Peacetime** | | |
| **Act III — Growth** | | | |
| S9 | Infrastructure, market access, merchant shipping (P8) | R1 | L |
| S10 | Firms, investment, ownership (P9, P10, P12) | S9 | XL |
| S11 | Banks, credit, bonds, gold; panics (P11, reduced P13) | S10 | L |
| S12 | Knowledge: fields, inventions, diffusion, production methods, new goods | S10 | XL |
| **Act IV — Nations** | | | |
| S13 | Heritage and faith: data, composition, status, claims, lenses | R1 | XL |
| S14 | Politics: beliefs, movements, parties, institutions, cabinet, laws, elections | S13 | XL |
| S15 | Stability and regime change; new polities | S14 | L |
| | **Release 2 — Nations** | | |
| **Act V — The Concert** | | | |
| S16 | Diplomacy: interests, treaties, negotiation, subjects, embassies | S14 | XL |
| S17 | Crises, congresses, prestige; the strategic AI | S16 | L |
| S18 | The road to war: 1900 diplomatic data, mobilisation plans, arms races, calibration | S17, S9 | L |
| **Act VI — Total war** | | | |
| S19 | Forces: classes, reserves, patterns, equipment, arms industry, mobilisation | S12, S14 | XL |
| S20 | Land war: fronts, operations, supply, occupation, general staff, War Room | S19, S9 | XL |
| S21 | Sea and air: sea zones, fleets, blockade, convoys, wings | S20 | L |
| S22 | War economy and home front | S20, S11 | L |
| S23 | Peace: aims, conference, terms, new states, reparations | S22, S17 | M |
| | **Release 3 — The Great War (1900 to 1925)**: the first build to show outside | | |
| **Act VII — The century** | | | |
| S24 | 1920s to 1940s: depression, one-party regimes and planning, mechanised war, bombing | R3 | XL |
| S25 | 1945 to 1970: deterrence, blocs, decolonisation, international organisations, welfare states | S24 | XL |
| S26 | 1970 to 2000: energy shocks, services and electronics, floating currencies, end states | S25 | L |
| S27 | Hundred-year calibration and release polish | S26 | L |
| | **Release 4 — 1900 to 2000** | | |

```
S0 ─► S1 ─► S2 ─► S3
             │
             └─► S4 ─► S5 ─► S7 ─► R1 ─┬─► S9 ─► S10 ─► S11
                  └─► S6 ─┘   S8 ─┘    │          └─► S12 ─────────┐
                                       └─► S13 ─► S14 ─► S15 ─► R2 │
                                                   │               │
                                                   └─► S16 ─► S17 ─► S18
                                                                    │
                          S19 ─► S20 ─► S21, S22 ─► S23 ─► R3 ─► S24 ─► S25 ─► S26 ─► S27 ─► R4
```

**S18 has two parts.** Its data, pressures and crisis calibration belong to Act V. Its mobilisation
timetables and the calibration of the general war need real forces and fronts, so they are done
after S20 and before S23 (`docs/statecraft/ACT_5_CONCERT.md`).

**Reordering that is safe.** Acts III and IV are independent and can swap or interleave. If war
should be on screen sooner, S19 and S20 can move ahead of Act V once S9 and S12 exist; wars are
then declared by hand until diplomacy arrives. Act VII is mostly content on finished systems.

---

## 15. How every stage is built

**Definition of done.** A stage ships, for each system it adds:

1. the Desk cards it raises;
2. its lens and its place-sheet rows;
3. its Gazette events;
4. AI use of every new action;
5. "why", forecast and codex entries for every new figure and action;
6. its wheel jobs registered with measured cost, inside the budget of §4.5;
7. unit, conservation, determinism and save tests, and Observatory metrics with envelopes;
8. the phone layout (844 × 390, tokens, 44 points) through the one code path; device tests are
   the designer's;
9. a completion report and decision entries, as today.

**Test tiers.**

| Tier | Runs | Content | Target time |
|---|---|---|---|
| Fast | every change | Fixtures and small worlds: units, conservation, determinism, protocol, interface | ≤ 5 minutes |
| World | before a commit to `main` | One 1900-world month, replay and save equality, the budget check | ≤ 20 minutes |
| Observatory | nightly and on demand | Many seeds over 10 to 100 years against envelopes | hours, unattended |

**The Observatory.** A headless batch runner with an HTML report per seed and across seeds:
population and product per head against Maddison, prices, the structure of employment, the timeline
of wars, the incidence of a Great War, regime changes, AI budgets, cost per wheel. It is the
instrument for calibration (P15), for AI quality and for the target of §8.6.

**Playtest log** (local only): decisions per minute, the longest idle stretch, forecast error in the
journal, where sessions end.

---

## 16. Known problems and where they land

| Problem | Source | Lands in |
|---|---|---|
| The ten-year collapse of incomes, employment and population | P7 report §4.2 | S1 |
| Over-entry into clerks and bureaucrats | P7 report §4.2 | S1 (H5) |
| Food gluts at the price floor | P7 report §7.2 | S1 (H4) |
| First week of the United States market out of balance | D-167 | S1 |
| 61 Russian and 13 Italian cotton mills unplaced | D-166 | S1 |
| Flax, hemp and ramie coverage gaps | D-166 | S1 |
| The year's demographic record written after the last checkpoint | P7 report §4.2 | S1 |
| Labour coefficients provisional, none fitted | P7 report §6.2 | S1, then the Observatory |
| Day of 929 ms; worst day 4,167 ms; snapshot 285 ms | D-161, P7 report | S2 |
| Simulation memory up 30 to 60 MiB since D-161; phones not measured | D-161 | S2 budget; designer's test |
| Full test run of 101 minutes | P7 report §5.1 | S3 |
| Steel at a quarter of 1900 output for lack of construction and investment demand | P5b, P6 | S9, S10 |
| Monetary demand for gold and silver | D-152 | S11 |
| Provinces cannot pass to a polity that is not instantiated | Prosperity §7 | S15 |
| Map rebuild scripts do not reproduce the committed map | D-146 | P7 close, step 8 |
| No device or tablet test of P7 | P7 report §6.3 | Designer |

The session that produced this plan found no separate list of bugs beyond these records. Anything
missing should be added here before S1 starts.

---

## 17. Risks

| Risk | Answer |
|---|---|
| Scope: 28 stages | Four releases that are each a complete game; Act VII is content on finished systems |
| The cadence change moves every dynamic | Done on a healthy economy (S1 first), compared by envelope with the daily build |
| Data for heritage, faith and 1900 diplomacy is large and sensitive | Provenance, provisional labels, a sourced-first list of regions, sober presentation |
| AI quality decides whether the world feels alive | AI is part of every stage's definition of done; the Observatory and the league table |
| The Great War may not calibrate from structure | The History settings add dispositions; parameters are documented; stronger dispositions before any script |
| Phone speed and memory are unknown until tested | Desktop budgets with spare; a memory budget; the designer tests each release |
| A forecast on a frozen rest of the world can mislead | It is labelled with what it holds fixed; the journal reports its error |
| The forecast and the journal expose model faults | Intended: they are the acceptance test of legibility |

---

## 18. Decisions (all approved by the designer on 2026-11-16, as recommended)

| # | Decision | Approved answer |
|---|---|---|
| 1 | Weekly market rounds and monthly demography and labour, in place of GDD §3.4's daily rules | Yes; it is the only credible route to 200 ms |
| 2 | Envelopes and invariants in place of 1900-world hash pins as the main regression guard | Yes; pins stay for replay and save equality |
| 3 | The design bible in place of the GDD's implementation records | Yes, in S0 |
| 4 | Stage order: Growth → Nations → Concert → Total war | As planned; war can move ahead of diplomacy if wanted (§14) |
| 5 | Release 3 covers 1900 to 1925 before the full century | Yes |
| 6 | The player is the government of the day and continues as the successor after a fall | Yes |
| 7 | Default History setting | Plausible |
| 8 | Heritage of about 300 groups and faith of about 30; the words "heritage" and "faith"; legal status modelled | Yes |
| 9 | P9 to P13 in two stages, without an order-book exchange | Yes |
| 10 | One thread, no WebAssembly unless S2 misses its budget | Yes |
