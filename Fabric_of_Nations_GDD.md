# FABRIC OF NATIONS — GRAND STRATEGY 1900–2000

**Official name:** *Fabric of Nations*\
**Document type:** Game Design Document — the design bible\
**Version:** 3.0\
**Revision date:** 2026-11-17\
**Target platform:** iOS and Android, in landscape; web is the development environment\
**Simulation period:** 1900-01-01 through the boundary at 2000-01-01\
**Simulation resolution:** one simulated civil day per tick (the calendar); the cadence of each
process is in B3

> **What changed in v3.0 (Statecraft stage S0, D-172 and D-173).** Version 2.19 had grown to
> 6,992 lines, most of them implementation records. This edition keeps what the game is (Part A),
> the binding rules (Part B), one short section per system (Part C) and the glossary (Part D). The
> full text of v2.19 is archived unchanged as `docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`.
> Sections §12.1 to §16 had been lost from the GDD in v2.14 by an editing error; their binding
> rules are restored here from `docs/archive/gdd/Century_GDD_v2.13.md`. Part E lists every old
> section number and where it went, so that older citations ("GDD §16.1") still lead somewhere.
> No rule was changed in this edition: where a rule reads differently from the old text, the
> decision that changed it is named beside it.

---

## How to read this document

**Authority** (handbook §2), highest first: `AGENTS.md`; the designer's instruction in the
current task; the Statecraft Program (`docs/STATECRAFT_PROGRAM.md`, approved 2026-11-16) and its
stage briefs and contracts (`docs/statecraft/`); this document; the archived records. Existing
code and tests show how things work today; they are not a reason to keep what the program
replaces.

**Kinds of requirement** *(GDD v2.19, "Document purpose and authority", verbatim)*:

The document distinguishes four kinds of requirements:

- **Binding rule:** must be followed unless the designer explicitly approves a change.
- **Current implementation:** behavior that the accepted baseline actually
  implements and tests. It is a statement of present scope, not a permanent
  reduction of the design intent.
- **Provisional model:** an initial implementation choice or coefficient that must
  be calibrated through tests and data.
- **Future system:** its interfaces may be prepared when needed, but implementation
  belongs to the specified later milestone or remains unassigned.

When two requirements conflict, follow this precedence order:

1. Conservation, determinism, data integrity, and security rules.
2. Explicit binding rules in this document.
3. The acceptance criteria for the current milestone.
4. Provisional model choices.
5. Agent preference.

The agent must not silently resolve a contradiction that changes game behavior: it is recorded in
`DECISIONS.md` with a proposed resolution, and a Statecraft stage stops and asks the designer
(handbook §5).

**Quotations.** A rule taken from an earlier edition is quoted word for word and tagged with its
source, for example *(v2.19 §2.1)* or *(v2.13 §16.1)*; old spellings are kept. An amendment by a
later decision is shown beneath the rule as a note and does not alter the quoted text. Section
numbers mentioned inside a quotation are those of the edition quoted; Part E translates them.

**Where things are.** Mechanics in detail: the archived editions and the decision register.
Plans and acceptance criteria of future work: the Statecraft stage briefs. Present behaviour: the
code, its tests and the completion reports.

### Contents

- Part A — The game: A1 Vision · A2 Design pillars · A3 Pillars of play · A4 Product definition ·
  A5 The loop · A6 The peacetime objective · A7 Non-goals · A8 Open design choices
- Part B — Binding doctrine: B1 No-Mana · B2 Calendar and clocks · B3 Cadence · B4 Boundary,
  determinism and numeric safety · B5 State, data and history · B6 Integrity and conservation ·
  B7 Money and accounting · B8 Historical data and calibration · B9 Player, AI and authority ·
  B10 Interface and the worker boundary · B11 Saves and versions · B12 Performance, measurement and
  tests · B13 Sovereignty and control · B14 How work is done
- Part C — Systems: C1 World and map · C2 Population and demography · C3 Economy · C4 Money and
  public finance · C5 Politics · C6 Technology and education · C7 Diplomacy · C8 War · C9 Country
  AI · C10 Interface · C11 News
- Part D — Glossary
- Part E — Concordance of old section numbers

---

# Part A — The game

## A1. Vision

*(v2.19 §1.1)*

*Fabric of Nations* is a historical grand-strategy simulation in which the player governs a state through the economic, demographic, political, and geopolitical transformations of the twentieth century. The simulation spans industrialization, urbanization, mass education, total war, ideological conflict, decolonization, fiscal expansion, and the rise of the service economy.

The player should feel that a country is not a collection of abstract meters. It is a population with needs, workers with occupations, businesses that produce and sell, governments that collect and spend money, institutions that shape behavior, and physical goods that must be extracted, made, transported, and consumed.

The simulation is deliberately aggregate. It models groups and systems rather than individual people. The target is a plausible and legible century-long causal model, not a perfect reconstruction of every historical detail.

The approved program puts the whole design in three sentences *(handbook §1)*:

1. **One world.** People, goods, money and power are simulated once and shared by every system. A
   soldier is a person who left a job in a province. A shell is steel that a mill made. A war loan
   is a bond that someone bought. No system keeps a private copy of reality.
2. **Legible.** The player can always see what is happening, why, and what can be done. Every
   figure has its causes one tap away. Every action shows a forecast before it is taken.
3. **Alive.** Other governments want things, act on them with the same rules as the player, and
   say why.

## A2. Design pillars

*(v2.19 §1.2)*

1. **Emergence over arbitrary abstraction.** Important outcomes should follow from population, labor, buildings, resources, money, laws, technology, and external events. A value may be stored as a cache, but its authoritative value must have an explicit causal definition.
2. **The century’s arc is content.** The decline of agricultural employment, the expansion and later relative decline of industrial labor, the growth of services, demographic transition, urbanization, literacy, and government expenditure should arise from model interactions and historical conditions.
3. **Money has counterpart entries.** Income, expenditure, savings, debt, profits, taxes, and monetary issuance must reconcile through an explicit accounting model. A balance may not appear without a source or disappear without a use.
4. **Mobile-first legibility.** The simulation can be deep; the presentation should be clear. Use summaries, charts, alerts, and drill-downs instead of forcing the player to read spreadsheets.
5. **Deterministic and testable simulation.** Given the same initial world and the same player/AI actions, the simulation must produce the same results on the same supported simulation version.
6. **Historical plausibility without railroading.** Historical data and events provide a credible starting point and external shocks, but the systems determine many of the consequences. Not every country must follow the same historical path.

## A3. Pillars of play

Added to the six design pillars, which stay *(program §2.2)*:

| Pillar | Meaning | How it is checked |
|---|---|---|
| A decision a minute | At default speed a meaningful choice arrives every 60 to 90 seconds, never more than three minutes apart | Playtest log: decisions per minute, longest idle stretch |
| Every number answers "why?" | No figure on screen without its causes and its levers one tap away | Audit test over the view registry |
| The world acts | Every system the player can use, the AI uses | AI coverage test per action |
| Consequences have faces | Effects land on places and people: the province that lost its class of 1896, the minister who resigned | Each stage ships its place-sheet rows and Gazette events |
| Nothing is a meter to spend | The No-Mana doctrine stays; it is the game's identity | Existing rule and audits |

## A4. Product definition

*(v2.19 §1.3)*

- **Genre:** historical grand strategy / macroeconomic simulation.
- **Platforms:** iOS and Android.
- **Primary interaction:** pause, inspect, issue policy and construction orders, then advance time.
- **Campaign:** 1900 to the start of 2000; the terminal state is the boundary at 2000-01-01.
- **World representation:** a stylized political map of approximately 500 regions, initially using curated region boundaries rather than a tile grid.
- **Population representation:** aggregate population blocks; never simulate individual citizens.
- **Simulation cadence:** one civil day per tick, with subsystem work staggered where safe.

> **Amended.** *World representation:* provinces replace regions as the only unit beneath a
> country (D-118); the 1900 world has 1,687 provinces (C1). *Platforms:* landscape on every device,
> the map always the screen (D-112, `AGENTS.md` §2). *Simulation cadence:* the day remains the
> calendar tick; the cadence of each process is B3 (D-172, decision 1).

## A5. The loop

*(v2.19 §1.4)*

Fabric of Nations must be a game in which the player governs a country's economy through
consequential policy choices, public spending, investment, and institution-building.
The player must be able to understand the economy's current condition, identify
important causes, choose interventions, finance those interventions, and assess their
results. Merely displaying simulation outputs while offering a handful of controls
does not satisfy this objective; economic decisions must change the actual simulation
through explicit, validated, deterministic mechanics.

The core gameplay loop is:

1. **Diagnose:** understand shortages, prices, production, employment, wages,
   household purchasing power, living standards, treasury conditions, and debt.
2. **Choose a strategy:** select policies and priorities suited to the country's
   problems and long-term objectives.
3. **Implement and finance:** apply policies, allocate public resources, authorize
   investment, and handle financing within the country's actual constraints.
4. **Observe and adapt:** inspect outcomes over days, months, and years; understand
   what changed and revise the strategy.

The approved program extends the loop over five time scales *(program §2.3)*:

| Scale | What the player does | What closes the loop |
|---|---|---|
| Minute | Answers the Desk: decisions and reports from the cabinet, crises with clocks | The forecast, then the result |
| Session (10 to 20 minutes; one to three years of peace, weeks of war) | Finishes something: a law, a railway, an offensive | The monthly report is the natural stop |
| Mandate (4 to 7 years) | Keeps or breaks the promises made to the coalition in power | Election, or the consent of the regime's pillars |
| Era (15 to 25 years) | Pursues national ambitions | Era review: power, prosperity, liberty, stability against history |
| Campaign | Writes an alternate twentieth century | The chronicle |

## A6. The peacetime objective

*(v2.19 §17J.1)*

A country that never goes to war and never engages in diplomacy must still be a
rewarding game. The internal game rests on a realistic, legible, causally driven
demographic and economic simulation in which the player sets conditions and
households and firms respond. The economic core is a dual economy with Engel
demand: a land-constrained agrarian sector with surplus labour, a capitalist sector
that reinvests profits where returns are high and draws workers into towns, demand
that moves from food to manufactures to services as incomes rise, and a
demographic transition driven by literacy, urbanisation, income, child survival and
health. Every country starts from its own 1900 position and may diverge from
history. §2 (no gameplay pools) binds every stage.

## A7. Non-goals

*(v2.19 §19)*

The following are out of scope unless the designer changes this section explicitly:

- 3D graphics.
- Hex grids or tile-grid world simulation.
- Individual-agent/citizen simulation.
- Detailed culture or religion mechanics; optional IDs may be added only when a real system needs them.
- Detailed naval warfare.
- Nuclear weapons simulation.
- Multiplayer.
- Procedural map generation.
- Full per-day chart history for the entire campaign.
- Animated unit sprites.
- Mod support.
- Localization beyond English.
- Fully simulated local-currency denominations, commercial banking products, and payment rails for every country.
- Perfect reconstruction of every historical event, national account, or regional boundary.

These exclusions do not prevent a later expansion. They prevent the first version from becoming unfinishable.

> **Amended by D-172** (the approved Statecraft Program): *detailed culture or religion
> mechanics* — heritage and faith are a system of stage S13 (decision 8); *detailed naval
> warfare* — stage S21; *nuclear weapons simulation* — Act VII. The other items stand.

Non-goals of the program *(program §2.5)*:

No unit-level micromanagement and no tactical battles. No spendable points of any kind. No scripted
history: history supplies starting conditions and calibrated pressures. No multiplayer (determinism
keeps the door open). No language model at run time; all text comes from data templates.

## A8. Open design choices and their defaults

*(v2.19 §20.2)*

These are intentionally left open because they depend on desired gameplay depth rather than technical correctness. Use the stated default until the designer chooses otherwise:

1. **Campaign victory/end state:** default is a sandbox with a historical end-of-century report, not a mandatory victory condition.
2. **Player country selection:** default is any fully authored sovereign polity in the selected scenario; incomplete stubs are not playable until validated.
3. **Ironman/reload restrictions:** default is unrestricted save/load, with no Ironman mode in v1.
4. **Historical deviations:** default is a baseline event set that allows outcomes to diverge; no forced “railroad” restoration after an alternate outcome unless an event explicitly requires it.
5. **Monetary depth beyond v1:** default is the fixed-RUSD measurement model with M4a-2 currency identity and RUSD-relative valuation; dynamic FX, inflation, monetary policy, central banking, detailed local denominations, and banking instruments remain deferred and are not current M4a-2 behavior. M8a is the planned stage for inflation measurement, exchange-rate dynamics, and monetary-policy foundations, but it is not implemented and any missing prerequisite must be recorded.
6. **Monthly-wealth income window:** the current convention uses current-day actual settled wages annualized by the civil year because the GDD does not define a monthly window and no accumulator exists. An exact trailing-month average requires an authoritative per-block income accumulator and a schema/save-format change. The default remains the documented provisional convention until the designer chooses a measurement window and migration policy.
7. **Economic Management open choices:** the questions in §17A.16 (construction capitalization/materials, land/property, trade counterparty, banking/credit, inflation measure, health/pensions/bargaining, sector classification, player/AI action expansion, GDP/headline measures, report retention, and save/schema migration) are otherwise unresolved. Each later E stage must resolve the questions it needs with a decision record and tests; none may be treated as accepted by E0 alone. E1 resolves report retention for its own scope as 12 monthly summaries plus 48 session actions (D-071); it does not resolve the other choices. The default is to leave the lever unimplemented until its mechanism exists.

The agent must not expand these topics autonomously during early milestones. It may add proposals to `DECISIONS.md` for designer review.

> **Settled or amended since.** #2: the 1900 catalog and country selection of M11 (D-086 to
> D-100; 66 selectable states, C1). #4: amended by D-172 — no scripted history; history supplies
> starting conditions and calibrated pressures (program §2.5), with the History setting
> "Plausible" as default (decision 7). #5: RUSD is 1990 reference dollars and players see their own
> currency (D-122, P3 D-140 and D-141); E6b added the price index and a reserve-backed monetary
> authority (D-080); banking and credit are S11. #7: the remaining questions of the archived
> §17A.16 are assigned to the Statecraft stages named in Part C.

---

# Part B — Binding doctrine

## B1. No-Mana: no arbitrary gameplay pools

### B1.1 Binding rule *(v2.19 §2.1, unchanged)*

The simulation must not introduce an arbitrary, spendable point pool merely to gate actions or create gameplay friction. A quantity traditionally represented by “mana” must instead be derived from people, institutions, resources, goods, money, time, laws, or other explicit state.

This does **not** prohibit every scalar, counter, index, or stored value. Money balances, inventory, debt principal, employment, technology project progress, building capacity, institutional quality, and other quantities are valid when their sources, uses, and update rules are defined.

### B1.2 Required replacements *(v2.19 §2.2, unchanged)*

| Traditional abstraction | Required model in *Fabric of Nations* |
|---|---|
| Political-power points | Support, organization, and leverage derived from population groups, wealth, literacy, laws, and institutions; enactment also consumes time and political support. |
| Research-point pool | Research work performed by employed academics and funded research institutions on explicit projects. Project progress records completed work; it is not a generic pool that can be spent anywhere. |
| Administrative capacity points | Administrative service derived from staffed and funded offices, bureaucrat labor, literacy, infrastructure, and institutional quality. Overload must have concrete effects. |
| Diplomatic capacity points | Funded foreign ministry, staffed diplomatic posts, communications, reputation, and available treaty leverage. |
| Manpower pool | Eligible working-age people assigned to military service, adjusted for participation, health, mobilization law, training, equipment, and existing assignments. |
| Command points | Officers and staff assigned to formations, modified by training, communications, doctrine, and command infrastructure. |
| War-exhaustion meter | Derived pressure from casualties, mobilization burden, disrupted production, unmet needs, debt service, inflation, and public opposition to the war. A cached summary may be shown in the UI. |
| Legitimacy points | A derived political indicator based on legal order, election outcomes, public welfare, regime support, military outcomes, and institutional trust. |
| Foreign influence points | Treaty obligations, reputation, trade dependence, credit relationships, strategic access, and other defined forms of leverage. |

### B1.3 Enforcement *(v2.19 §2.3, unchanged)*

- Do not create generic spendable resources such as `researchPoints`, `politicalPowerPoints`, or `diplomaticPoints`.
- Do not ban legitimate terms such as `capacity`, `power`, or `influence` when they describe a concrete or derived quantity. A warehouse capacity and a derived interest-group influence score are valid.
- A stored derived quantity must be recomputable from authoritative state. If stored as a cache, it must be safe to discard and rebuild.
- Any accumulated quantity must identify what creates it, what consumes or changes it, its units, and its boundary conditions.
- Fixed per-tick progress is permitted only when it represents a defined causal process. For example, academic work can advance a specific technology project; technology progress cannot appear merely because a day passed.
- Implement automated checks for known forbidden pools and add subsystem-specific causal tests. A grep rule may warn about suspicious names, but must not be the sole enforcement mechanism.

### B1.4 Derived indices are not money *(v2.19 §20.1 #9)*

9. **Wealth level:** a cached/smoothed index per pop block, not money and not an independently spendable resource. Monthly update uses the provisional income convention in §6.5; M4c includes welfare in the income basis and income tax in mandatory payments; an exact trailing-month average is not implemented.

## B2. Calendar, speeds and clocks

### B2.1 Calendar convention *(v2.19 §3.1)*

Use integer day indices and an explicit Gregorian-calendar implementation. The simulation package must not depend on `Date`, local time zones, daylight-saving time, or wall-clock APIs.

- `dayIndex = 0` corresponds to 1900-01-01.
- The campaign processes the civil days from 1900-01-01 through 1999-12-31.
- There are **36,524 daily ticks** in this interval, including Gregorian leap days from 1904 through 1996.
- After those ticks, `dayIndex = 36,524` is the terminal boundary corresponding to 2000-01-01. No additional campaign day is processed.
- The state’s `dayIndex` always means the **next civil day to process**, except when it reaches the terminal boundary, at which point the campaign is complete.

The calendar implementation must be covered by tests for year boundaries, month lengths, leap years, 1900-02-28, 1900-03-01, 1996-02-29, 1999-12-31, and the terminal boundary. Gregorian rule: a year divisible by 100 is not a leap year unless it is also divisible by 400.

### B2.2 Speed controls *(v2.19 §3.2)*

Supported player speeds:

- Pause
- 1 simulated day per second
- 3 simulated days per second
- 10 simulated days per second
- 30 simulated days per second

At 30 days per second, a complete 36,524-tick campaign takes approximately 20.3 minutes of uninterrupted simulation time, excluding UI and device throttling. This is a throughput target, not a requirement to run continuously while the app is backgrounded.

Default background behavior: pause simulation when the app enters the background, save safely, and resume when the player returns. Any optional offline catch-up mode must be explicitly designed, bounded, deterministic, and tested separately.

### B2.3 Simulation and UI clocks *(v2.19 §3.3)*

- Simulation time is exclusively the integer `dayIndex` and its deterministic calendar mapping.
- UI animation and batching may use a wall clock outside `packages/sim`.
- The simulation must not depend on real elapsed time, device time, frame rate, or task scheduling.
- Speed controls determine how quickly the driver calls `tick`; they must not alter the result of a given number of ticks.

### B2.4 Month and year boundaries *(v2.19 §4.4)*

- Use actual calendar months, not a fixed 30-day month.
- Annual demographic transitions and annual history samples occur at documented civil-calendar boundaries. January 1 ageing is skipped on a scenario's initial January 1.
- Monthly systems should have explicit due checks, not independent timers. **Current M3f/M4b/M4c:** monthly wealth runs on the last civil day of the month after needs and daily militancy, and the M4b finance period close runs immediately after that month-end wealth update, before the day advances (§4.2 step 14, §5.4.2). Income tax and the welfare transfer are daily fiscal flows inside step 12, not month-end timers. Other monthly finance, political, and history systems are future work.
- Accruals remain daily even when payment settles monthly. A monthly settlement must not duplicate or omit accruals. **Current M4c:** income tax accrues and is withheld daily; welfare accrues and is paid daily; the monthly close recognizes the period result but does not re-run either flow. *(M5b now implements debt and interest accrual; annual close remains planned in M7a.)*

## B3. Cadence

### B3.1 The rule today *(v2.19 §3.4)*

This table is binding until the Clockwork stages replace it (B3.2). Until S2 lands the day is
still fully daily (handbook §2).

Subsystems may run daily, monthly, weekly, annually, or when dirty. Cadence is an optimization and model rule, not a second simulation clock.

| Subsystem | Evaluation cadence | Binding notes |
|---|---|---|
| Births and deaths | Daily | Use age/sex-specific annual schedules converted with the actual civil-year length and deterministic fractional-person accumulation. |
| Age-state transitions | Annually | Advance every person exactly one single year at the annual boundary; the scenario `startDayIndex` is not aged on its first day. Five-year bands are derived aggregates, not authoritative state. |
| Production and goods flows | Daily | Inventory and production must conserve goods. |
| Pop consumption and unmet needs | Daily | Process needs tiers in a deterministic allocation procedure. |
| Wages, sales, profits, and operating costs | Daily | Use completed transactions and the defined wage model. |
| Price adjustment | Daily | Apply bounded updates using market imbalance; no equilibrium solver is required. |
| Treasury accruals | Daily | Record revenue and expenses as they arise. M4c records income-tax revenue and welfare expense daily through balanced postings. |
| Interest accrual | Daily | Contractual interest accrues over elapsed days. |
| Bond settlement and maturity | Monthly or on contractual date | Month lengths follow the calendar; maturities use exact day indices. |
| Household financial assets | Daily | Update only through actual income, expenditure, transfers, saving, borrowing, or losses. |
| Employment assignment | Monthly and when dirty | No block may be assigned more workers than its available workforce. |
| Political indicators | Weekly, staggered | Order of evaluation must not change the result. |
| Country AI | Every 7 days, staggered by stable country ID | Decisions are deterministic and validated before application. |
| Elections and scheduled laws | Calendar events | Evaluate legal eligibility and result rules explicitly. |
| Technology projects | Daily | Progress depends on assigned research labor and funded institutions. |
| Historical events | Scheduled day or explicit trigger | Events must be data-driven and idempotent. |
| Derived dashboards and caches | At documented cadence | Caches can be discarded and rebuilt. |

### B3.2 The approved replacement *(D-172, decision 1; program §4)*

Weekly market rounds and monthly demography and labour replace the daily rules of B3.1. Each
process runs at the cadence its dynamics need; a scheduler owns the day's budget, and every job is
registered with a wheel, a slot and a measured cost (program §4.2; `CONTRACTS.md` §1). The wheels
*(program §4.3)*:

| Wheel | Slots | What runs |
|---|---|---|
| Day | every day | Calendar, dated events, crisis clocks, construction progress, war (movement, supply, combat), one slice of country AI, view deltas |
| Week | 7 | Each customs territory has a market day. On it the territory runs one round for the week: production and extraction, household and firm demand, clearing, the price step, wages, profits and taxes, trade dispatch. Shipments are dated, so territories with different market days trade through goods in transit |
| Month | 28 (days 29 to 31 are light) | Demography (the month's births and deaths), labour market, mobility and migration, education and health, beliefs and movements, assimilation and conversion, unrest; the month's accounting close |
| Year | 52 | Ageing (1 January, a block move), annual accounts, strategic reviews of the AI, treaty reviews |

Slots are assigned once per scenario from stable ids and measured cost (the largest territories on
different market days), so the schedule is deterministic and identical on every device. Contractual
amounts (interest) are computed in closed form for the days elapsed at the next posting.

The replacement takes effect stage by stage: the wheels in S2a, cohorts and weekly journals in
S2b, views in S2c. Each of those stages updates B3.1 when it lands. Rates stay per day or per
year, and a job multiplies by the exact days elapsed (`CONTRACTS.md` §1.3).

## B4. The simulation boundary, determinism and numeric safety

### B4.1 Pure simulation boundary *(v2.19 §4.1)*

`packages/sim` is a deterministic TypeScript simulation library. It must not import React Native, Expo, DOM APIs, UI libraries, platform storage, network clients, or device APIs.

The simulation receives a world state and a set of explicit player/AI actions. It advances one civil day using a defined update pipeline. It must not read external state or silently generate player input.

Use a single authoritative world state. UI snapshots, chart history, and cached summaries are derived representations and must not become alternative sources of truth.

### B4.2 One documented order *(v2.19 §4.2 and §20.1 #7)*

The economic day follows one documented update order. The current M3f/M4b order is
binding for economic worlds:

*(The step list that followed is archived; see the note below.)*

7. **Daily ordering:** the pipeline in §4.2 is binding unless changed with tests and a decision record. In particular, M3d market clearing includes bounded price adjustment before M3e settlement; settlement uses established transaction prices (D-043). Moving price adjustment after settlement requires a new decision and regression tests.

> **Current order.** The step list of v2.19 §4.2 was last updated at P1b (D-125, D-126) and no
> longer lists the phases P4 to P7 added. The authoritative order today is the code's,
> `runEconomicDay` in `packages/sim/src/economy/day.ts`, and changing it still needs tests and a
> decision. From S2a the order is the scheduler's registered job order (`CONTRACTS.md` §1.5). The
> old list is in the archived v2.19 §4.2.

### B4.3 Randomness *(v2.13 §16.1; v2.19 §20.1 #6)*

Use keyed/counter-based deterministic randomness rather than one global mutable random stream. Each draw is keyed by a stable tuple such as `(worldSeed, dayIndex, entityId, purposeId, drawIndex)` and returns a reproducible value in `[0, 1)`.

- Every draw has a stable purpose identifier.
- A newly added random draw for one entity must not change unrelated entities’ random outcomes.
- Do not use `Math.random`, `Date`, `performance.now`, or external entropy inside `packages/sim`.
- The PRNG/hash algorithm and known-answer test vectors must be documented.
- A seed alone is insufficient if action input, data version, or simulation version changes; those must also be recorded in a reproducibility report.

6. **Randomness:** keyed/counter-based deterministic random draws, not one shared mutable PRNG stream.

The algorithm and its known-answer vectors are documented in `docs/randomness.md` and
`packages/sim/src/rng.ts` (D-006).

### B4.4 Repository layout and threads *(v2.13 §14.1)*

```text
/packages
  /sim            pure TypeScript simulation; no RN/DOM/device imports
  /data           validated source tables and generated static definitions
  /sim-worker     worker/bootstrap and snapshot protocol, if needed by platform
  /app            Expo / React Native application
  /bench          headless performance and long-campaign harness
  /tests          unit, integration, invariant, serialization, and determinism tests
```

`packages/sim` compiles with `"lib": ["ES2022"]` only and depends on no platform API
(`AGENTS.md` §3). The simulation runs on one thread (D-163); there is no WebAssembly unless S2
misses its budget (D-172, decision 10). The project commands are in `AGENTS.md` §5.

### B4.5 Numeric safety *(v2.13 §16.3)*

- Validate every external/data input.
- Reject NaN and infinity in authoritative state.
- Use explicit tolerances for floating-point invariant comparisons; do not apply arbitrary epsilon rules to integer IDs or counts.
- Apply clamping only where a model definition calls for it. Clamping must not conceal a conservation failure.
- Integer people/item counts remain non-negative integers. If rates yield fractional daily counts, retain the fractional remainder deterministically.
- Report invariant violations with entity IDs, day index, subsystem, and relevant quantities.

## B5. State, data and history

### B5.1 General rules *(v2.19 §5.1)*

- Static definition data is immutable and versioned; it is loaded from validated data files.
- Runtime state is serializable and versioned.
- Dense numeric IDs are stable within a save. Do not rely on array order remaining stable after migration or content changes.
- Authoritative state is stored once. Derived statistics are caches that can be recalculated.
- Every numeric field has documented units, valid ranges, ownership, and update cadence.
- Validate input data before a campaign starts. Invalid data must produce a useful error instead of silently defaulting to zero.
- Do not store `NaN`, infinity, or undefined values in serializable state.

### B5.2 Static/runtime split and serialization *(v2.19 §5.6)*

- Definition files are immutable, versioned data and may be cached after validation.
- Runtime state must round-trip through the canonical serializer without loss of type or meaning.
- Typed arrays must be explicitly encoded and reconstructed; plain `JSON.parse` is not sufficient to restore typed-array instances.
- Use a versioned save envelope: schema version, simulation version, content/data version, day index, seed, state payload, checksum, and optional migration metadata.
- Save migration must either convert a known older version or reject it with an actionable message. Never silently load incompatible state as if it were valid.

> **Amended by D-013 and the no-legacy-saves rule** (handbook §2): there are no save migrations.
> An older save is rejected with its reason (B11).

### B5.3 Population, geography and markets *(v2.19 §17J.2 rules 1 to 3)*

1. **Population (D-117).** A population block is (province, profession), sparse,
   with full single-year male/female age arrays. Profession-specific demography,
   wages, wealth and political interests are preserved. The model is not simplified
   to meet a performance budget; performance is engineered and benchmarked.
2. **Geography (D-118).** Provinces are the only unit beneath a country for
   population, buildings, construction, unrest, infrastructure, land and resources.
   The simulation-region layer is removed. Country territory derives from province
   ownership; occupation is province control.
3. **Markets (D-119).** A market is a customs territory with one tariff authority.
   Independent states, dominions and tariff-autonomous vassals have their own;
   colonies and protectorates join their overlord's; historical customs unions are
   explicit. Membership follows historical customs arrangements, never political
   status alone.

### B5.4 Data validation *(v2.13 §15.5)*

The loader must reject or warn on:

- Duplicate IDs or tags.
- Missing country/region references.
- Invalid sovereignty/overlord cycles.
- Negative population, resources, costs, rates, or storage.
- Single-year male/female arrays with invalid lengths or non-integer counts.
- Five-year derived aggregates that do not reconcile to the authoritative single-year sex arrays.
- Age/sex groups whose totals do not match declared population totals beyond the allowed expansion/rounding rule.
- Buildings with unknown goods/professions/technologies.
- Technology cycles or missing prerequisites.
- Laws with invalid slots or effects.
- Market/region membership inconsistencies.
- Calibration targets with missing units or sources.

Historical data must be editable independently of simulation logic. Do not bury country-specific historical exceptions in general-purpose functions when they belong in the data/event layer.

### B5.5 History and diagnostics *(v2.13 §14.7)*

Persist annual samples only for long-range charts; avoid per-day history buffers for all fields. Maintain monthly summaries for finance and any detail needed by the Ledger UI. **Current M4b/Batch 3:** each closed month stores one `FinancePeriodSummary` in `FinanceState.periodSummaries`. The most recent 12 retain the pre-close account trial balance plus the four gross flow totals; older summaries retain the period dates, exact per-country fiscal totals, and the four gross flow totals. There is no per-day chart history and no `World.history` collection yet. Keep a bounded recent event/transaction audit ring for debugging. Expose optional debug counters for conservation errors, invalid states, allocation failures, and performance metrics.

### B5.6 State, ids and saves

New authoritative state follows `CONTRACTS.md` §14: it belongs to `World` with canonical
serialization, validation and hashing; anything held per block, province, building or account is
a typed column indexed by numeric id; ids are positive integers, never reused, iterated in order;
a cache is rebuilt on load, never saved.

## B6. Integrity and conservation

### B6.1 Conservation equations *(v2.13 §16.4)*

At minimum, test these identities:

**Population:**

`populationEnd = populationStart + births - deaths + immigration - emigration`

Profession changes, annual ageing, internal migration, and regional ownership changes must not alter world population. Internal migration changes regional counts but nets to zero globally.

**Goods:**

`closingStock = openingStock + production + imports - domesticUse - exports - losses`

All forms of use, including intermediate inputs and final consumption, must be counted exactly once.

**Government cash:**

`cashEnd = cashStart + receipts + borrowingReceived + otherInflow - spendingPaid - interestPaid - principalRepaid - otherOutflow`

Accrued but unpaid items must be separately represented. Borrowing is financing, not revenue. **Current M4c/E2/M5b:** `receipts` is daily income tax plus month-end business-profit tax; `spendingPaid` is daily welfare actually paid; `borrowingReceived` and `principalRepaid` are the M5b/E2 financing movements; `interestPaid` is the cash coupon/maturity payment, distinct from accrued interest expense. A welfare funding shortfall is unfunded rather than accrued, so it is reported as a shortfall and is not a liability. Income tax is withheld only from cash actually received, so it creates no arrears. The month-to-date budget memo reports requested/paid/shortfall and financing separately; it is not a liability ledger.

**Financial postings:**

For each posted transaction, total debits equal total credits. Changes in assets, liabilities, income, and expense follow the defined account rules.

### B6.2 Integrity and rollback *(v2.19 §17J.2 rule 4, §17J.4)*

4. **Integrity (D-116).** Each phase validates its preconditions; cheap global
   invariants run daily; full validation runs at month end, on load/save/actions and
   in tests. A failed day is rolled back to its start through checkpoint and
   deterministic replay; no partial day is ever accepted, and no subsystem can be
   restored separately from the others.

The runner keeps a last good checkpoint, taken at month start and before each
accepted action, and a journal of accepted actions since it. A failing phase aborts
the day; the runner restores the checkpoint, replays to the start of the failed day,
checks the replayed world hash against the hash recorded at that day's start, and
reports the error. A mismatch is an integrity failure and the run does not continue.

> **Supersedes** whole-day staging on a structural clone (v2.19 §4.2 and §20.1 #14; D-116).

### B6.3 Scarcity and allocation *(v2.19 §4.3)*

Market demand must distinguish:

- **Desired demand:** the amount households, buildings, and government would use if fully supplied and financed.
- **Funded demand:** desired demand that buyers can pay for at current prices under their constraints.
- **Fulfilled demand:** the amount actually delivered after stock and priority allocation.
- **Unmet demand:** desired or funded demand not fulfilled, with the distinction retained in diagnostics.

Within a market, goods are allocated through explicit priority tiers. Initial policy:

1. Household subsistence needs.
2. Critical operating inputs needed to keep essential production running.
3. Household basic needs.
4. Essential government demand and legally required services.
5. Remaining productive inputs and construction demand.
6. Comfort and luxury consumption.
7. Non-essential exports or other discretionary demand.

All recipients within a priority tier share scarcity proportionally to their eligible demand, subject to funded demand. This initial ordering is provisional and must be tested against plausible shortage scenarios. Do not use pop-array order, numeric ID order, or building insertion order as an implicit allocation rule.

### B6.4 Employment *(v2.19 §6.7, §20.1 #2)*

2. **Employment:** explicit quantitative assignments; no single `employedAt` per pop block.

- Total workers assigned from a pop block cannot exceed that block’s eligible available workforce.
- Total workers assigned to a building/profession cannot exceed its jobs at current level and condition.
- A worker cannot be assigned simultaneously to two jobs or to military service and civilian employment.
- Every working-age person must be accounted for as employed, unemployed/seeking work, outside the labor force, or assigned to another defined role.
- The allocation rule must be deterministic and tested for identical outcomes regardless of incidental array ordering.

### B6.5 Finance invariants *(v2.19 §8.7)*

- Every journal posting balances.
- Every debt contract has exactly one issuer and one current holder/holder sector.
- Bond issuance creates matching liability and asset entries.
- Principal repayment reduces both the issuer’s liability and the holder’s asset.
- Tax, wages, dividends, interest, and transfers move balances between counterpart accounts.
- The aggregate monetary stock changes only through defined issuance, redemption, destruction, or reclassification rules.
- Nominal accounting must reconcile within the configured floating-point tolerance; unexplained balance drift is a test failure.

## B7. Money and accounting

### B7.1 RUSD *(v2.19 §5.2)*

`RUSD` — **Reference US Dollars** — is the simulation's fixed **unit of
measurement and accounting denomination**. It is a neutral reference unit used
to compare and calculate economic values across national monetary systems. It is
not a currency issued by any country, not legal tender, not an adoptable
national currency, and not a replacement for the real-world United States
dollar or any other national currency. One RUSD is not defined as one real US
dollar, and no fixed USD/RUSD exchange rate is implied.

> **Amended by D-122.** One RUSD has the purchasing power of one real-world US dollar of 1990. It
> is the simulation's stable internal reference and measurement unit, and it is not the simulated
> United States dollar, whose value against RUSD moves with the simulation. The second paragraph
> of v2.19 §5.2 and the RUSD entry of v2.19 §21 ("not … a promise of constant purchasing power")
> are superseded by this definition (D-122 item 4; `AGENTS.md` §1).

### B7.2 Accounting principles *(v2.19 §8.1)*

V1 uses RUSD as the fixed unit of measurement and accounting denomination. M4a-1
keeps all accounting balances in nominal RUSD; M4a-2 adds currency identity and
RUSD-relative valuation but no native-currency balances or a parallel ledger. The
design does not claim to reproduce every detail of national banking systems, but
it does require internally consistent financial flows.

The complete v1 finance subsystem must eventually support:

- Household financial assets.
- Business operating cash/assets and debt.
- Government cash, revenue, expense, debt, and interest obligations.
- Bank/central-bank accounts and monetary issuance where enabled.
- Domestic and foreign bond holders.
- A rest-of-world counterparty for external trade and financial flows.
- A double-entry posting interface with balanced transactions.

A transaction must never make money appear without a counterpart entry. Valid sources include earned income, transfers from another account, borrowing, or explicit monetary issuance. Valid uses include purchases, taxes, interest, transfers, asset acquisition, losses, or redemption. Money-supply changes must be recorded, not inferred from a price index alone.

### B7.3 Money for the simulation, currency for the player *(v2.19 §17J.2 rule 6)*

6. **Money (D-122).** RUSD is the simulation unit with the purchasing power of a
   1990 US dollar. Players see their own currency, or a chosen display currency,
   converted at display time. RUSD is for the simulation; local currency is for the
   player.

### B7.4 Monetary precision *(v2.19 §20.1 #18)*

18. **Monetary precision and result phases:** authoritative RUSD uses continuous binary64 arithmetic in a fixed order with no cent quantization; `MONEY_TOLERANCE_RUSD = 1e-6` is an invariant tolerance, not a rounding operation. Transient settlement, needs, and fiscal cash fields are phase-qualified; the authoritative ledger is final cash. D-049 records the policy and its known-answer/residual rules.

## B8. Historical data and calibration

### B8.1 Calibration philosophy *(v2.13 §15.2)*

Calibration means checking whether a model with documented parameters can approximate defined historical aggregates under a named baseline scenario. It does not mean hardcoding outcomes to match a table. Tune coefficients only after identifying the source of a mismatch; change the model when its structure is wrong.

Two population scenarios must remain distinct:

1. **Historical-validation scenario.** Start from the WPP 2024 1-January-1950 age/sex distribution and test source-backed annual 1950–2000 ASFR and sex-specific mortality through 2000. This is the primary check of post-1950 demographic mechanics and age structure.
2. **1900 campaign scenario.** Start from the source-derived 1900-01-01 world-population estimate, but use provisional 1900 age/sex structure and provisional 1900–1949 fertility/mortality. This is a gameplay baseline, not a historical validation of its pre-1950 composition or of a no-shock counterfactual.

Source conventions must be explicit:

- The OWID long-run population series is used for the earlier historical record and the 1900 campaign total.
- The WPP 2024 1-January population series is used for the WPP-initialized validation scenario.
- OWID-derived January 1 values are estimates from adjacent annual values treated as mid-year observations. They are not direct January 1 observations.
- The 1950 source splice and any difference between OWID-derived and WPP 1-January totals must be disclosed, not silently blended.
- Rounded GDD population anchors remain historical orientation until their definitions and source conventions are consistent. They must not silently override source-backed targets.

Observed historical mortality is an all-cause baseline. Future wars, pandemics, famines, and genocides must be explicit events, and event design must avoid double-counting deaths already embedded in the baseline schedule.

Every target must specify:

- Exact metric definition.
- Geographic and political scope.
- Year and nominal/real basis and year convention.
- Units.
- Target and acceptance tolerance.
- Source and access date.
- Confidence level / known uncertainty.
- Whether the target is source-backed observation, calibrated model output, or provisional input.

Use primary or authoritative sources where available. If a historic estimate is uncertain, record that uncertainty and use a wider tolerance. Do not silently mix nominal and inflation-adjusted values, national and federal accounts, population totals and workforce shares, or incompatible territorial boundaries. Simulation code must not read reference totals to force its own trajectory.

### B8.2 Employment structure *(v2.13 §15.4)*

“Peasant share” must not be used ambiguously. The default statistic is:

`agricultural/peasant employment share = employed workers in the defined agricultural/peasant occupations / total employed civilian workforce`

Exclude dependents from the numerator and denominator. Define separately whether agricultural wage laborers count as peasants or laborers. Use country-specific baselines: the United States, United Kingdom, Germany, France, Russia, Japan, and other states differed substantially in 1900 and followed different trajectories.

> **Note.** The agricultural-share acceptance criterion of P7 was removed by the designer (D-167);
> the definition above still governs any such statistic.

### B8.3 Demography is caused *(v2.19 §17J.2 rule 5)*

5. **Demography (D-124).** Fertility and mortality levels are caused by simulated
   conditions; historical series are calibration and validation targets only.

### B8.4 Data sources and provenance *(v2.19 §17J.2 rule 8)*

8. **Data (D-121).** HYDE 3.3 distributes population and land within countries;
   USGS deposit data plus authored historical fields place resources; provenance,
   version, coverage and limitations are documented.

Initial buildings follow sourced 1900 output or the people who worked there, never reserves, land
or potential (designer's rule of 2026-11-10). Historical content is data, not code: each data file
has a source table, a generator script with a `--check` mode and a provenance document, and a value
without a source is marked provisional (handbook §9).

## B9. Player, AI and authority

### B9.1 Authority rules *(v2.19 §17A.2)*

**Authority rules:**

1. One country is player-controlled (`playerCountryId`); all other countries are
   AI-governed. The player's fiscal/economic policy must never be silently overwritten
   by AI decisions.
2. Policies act through real mechanics, never through a decorative score or arbitrary
   bonus.
3. The app sends only supported validated actions through the worker protocol and
   reads only immutable snapshots/selectors. It never imports simulation internals or
   mutates the live world.
4. Determinism, accounting identity, conservation, atomic publication, save
   compatibility, and the data-version policy remain binding.
5. If a prerequisite is missing, record the dependency and leave the lever
   unimplemented; do not approximate it with an undefined scalar.
6. Provisional parameters must be identified as provisional. Structural feasibility
   and historical calibration are separate claims.

### B9.2 Design principles *(v2.19 §17A.3)*

1. **One country is player-controlled.** Other countries are governed by their AI.
   The player's fiscal and economic policy must not be silently overwritten by AI
   decisions.
2. **Policies operate through real mechanics.** Every control must affect an actual
   tax base, expenditure, incentive, institution, resource flow, or project.
3. **Choices have trade-offs.** Tax cuts affect revenue; spending affects the budget;
   subsidies consume resources; investment uses labor and materials; trade
   restrictions alter actual trade and input availability once trade exists.
4. **Time lags matter.** Different actions resolve on appropriate time scales. Do not
   make major structural changes instantaneous unless the policy genuinely acts
   immediately.
5. **The government faces constraints.** Treasury liquidity, debt, creditors, labor,
   goods, productive capacity, and institutions limit what the player can accomplish.
6. **Outcomes are explainable.** The player can inspect the relevant causes and
   recorded decisions behind important changes.
7. **Country institutions are historically and scenario appropriate.** Policies must
   respect what a particular country can actually do under its modeled institutional
   and monetary arrangements.
8. **Determinism is preserved.** Policy evaluation, construction progress, and
   resulting simulation state must remain deterministic and replayable. UI telemetry
   and explanatory presentation must not affect authoritative simulation state.
9. **UI and simulation remain separated.** The app reads public immutable snapshots
   and sends supported actions. It does not import simulation internals or mutate the
   live world.
10. **Calibration is not a substitute for mechanics.** Document provisional parameters
    and separate structural feasibility from historical calibration.
11. **No decorative controls.** Every implemented lever must produce a defined,
    testable consequence. If its necessary mechanics do not exist, list it as a future
    dependency.

### B9.3 The AI's decision model *(v2.13 §12.1)*

Country AI is rule-based and evaluated every seven days, staggered by stable country ID. Its output is a list of proposed actions; the simulation validates legality, affordability, prerequisites, and timing before applying them. M6's first evaluation is the first day after the scenario start whose absolute day index is congruent to the stable country id modulo seven; subsequent evaluations are seven days apart, and the terminal 2000-01-01 boundary is never evaluated.

Initial goal priority for the economic/political AI:

1. Avoid immediate insolvency or essential-service collapse.
2. Respond to severe unmet needs and destabilizing unrest.
3. Remove critical production bottlenecks.
4. Improve labor productivity, education, and infrastructure.
5. Industrialize when feasible and economically justified.
6. Maintain required security and military commitments once military systems exist.
7. Pursue expansion or diplomatic goals only when those systems and conditions are available.

Priority may be adjusted by regime, laws, security conditions, institutions, and scenario. The list is not a script that every country must follow in every circumstance.

> **To be replaced** by the cabinet AI of S8 and the strategic AI of S17 (program §11); the rule
> that AI output is a list of proposed actions validated like the player's stays
> (`CONTRACTS.md` §9).

### B9.4 AI information and reproducibility *(v2.13 §12.2)*

- An AI may use information available to the country it governs and public information defined as visible to players.
- It must not use hidden information or future events not available to a comparable player.
- It uses the same action validation rules as the player.
- Its decisions must be deterministic for a given state, seed, and evaluation day.
- Any stochastic choice must use keyed deterministic randomness with an explicit purpose identifier.
- Avoid AI re-planning that emits contradictory actions every tick. Goals persist until completion, invalidation, or a documented re-evaluation rule.

### B9.5 The player is the government

The player is the government of the day and continues as the successor after a fall (D-172,
decision 6). Every system the player can use, the AI uses (A3; handbook §8).

## B10. Interface and the worker boundary

### B10.1 The frame

Fabric of Nations is a mobile game: iOS and Android are primary, landscape is mandatory, phones
at 844 × 390 points are the reference, every control is at least 44 points, nothing depends on
hover, one style comes from `packages/app/src/design/tokens.ts`, and a feature is not finished
until it reaches a phone (`AGENTS.md` §2). *(v2.19 §17I.8)*:

> **Superseded by D-112 (Living Atlas).** The game runs in landscape on every device.
> iOS and Android are primary, the map is always the screen, and every screen opens as
> a sheet over it, in four domains: Realm, Economy, Society and World.

### B10.2 Mobile readability *(v2.13 §13.4)*

- No numeric table should require more than six columns on a phone.
- Important status changes should be explained in plain language and linked to underlying causes.
- Show a concise summary first, with optional detailed breakdowns.
- Every key indicator should expose a definition, unit, scope, and update time.
- Avoid presenting every internal simulation variable as a player-facing meter.

### B10.3 Data flow *(v2.13 §13.5)*

The app subscribes to immutable snapshots emitted by the simulation worker at a target rate of up to 10 snapshots per second. A snapshot contains only the fields needed for the visible UI and selection context. The UI must never read or mutate the live simulation world.

Snapshot rate can be reduced under load. Dropping intermediate visual snapshots is acceptable; dropping simulation ticks or changing simulation results is not.

> **Amended by D-172** (program §3 change 4, §4.4 item 4): from S2c the interface subscribes to
> named views with deltas at their own cadence instead of a full snapshot (`CONTRACTS.md` §3). The
> boundary does not change: the UI never reads or mutates the live world.

### B10.4 Thread protocol *(v2.13 §14.3)*

The worker protocol must define versioned messages for:

- `START`, `PAUSE`, `STEP`, and speed changes.
- Player actions with stable IDs and validation errors.
- Snapshot delivery and sequence numbers.
- Save request/response.
- Load request/response and migration failures.
- Worker errors, fatal simulation errors, and shutdown.

Commands that affect simulation state are applied only at defined tick boundaries in a stable order. UI commands must not mutate the world directly.

> **Amended by D-013:** load failures report incompatibility; there are no migrations.

### B10.5 State management *(v2.13 §14.5)*

Zustand or an equivalent state store may hold:

- `simSnapshot`
- `uiSelection`
- `settings`
- loading/error state

The app may import snapshot types and protocol types. It must not import simulation implementation modules for UI-side calculations, except for a deliberately shared type-only module that has no runtime behavior.

## B11. Saves and versions

### B11.1 Save system *(v2.13 §14.6)*

- Serialize the authoritative state with the versioned serializer.
- Encode typed arrays explicitly; validate all numeric fields before saving.
- Compress the payload if measurement shows it is worthwhile.
- Save through a platform-appropriate storage layer, selected and tested for size, durability, and performance.
- Use an atomic/replace-safe save strategy, ideally keeping a last-known-good save until the new save is verified.
- Include checksum/integrity validation and a clear recovery message when a save is corrupt.
- Reject an unadvanced staged close state: serialization and hashing require `closedThroughDay === null || closedThroughDay < dayIndex` (§5.4.2).
- Test save/load mid-month, mid-year, after an event, after random draws, immediately after a month-end close once the day has advanced, and at the terminal boundary.

### B11.2 Older saves *(v2.19 §17J.2 rule 7)*

7. **Saves (D-120).** The schema break is accepted; older saves are listed as
   incompatible with the reason and are never deleted or overwritten automatically.

### B11.3 Versions

No legacy saves and no migrations: a stage that changes the save bumps `WORLD_SCHEMA_VERSION`
(`packages/sim/src/constants.ts`) once, a stage that changes results bumps `SIM_VERSION` once, a
stage that changes the protocol bumps `PROTOCOL_VERSION` (`packages/sim-worker/src/protocol.ts`)
once, and older saves are rejected (D-013; handbook §2, §5). At v3.0: world schema 36,
simulation 0.32.0, save format 2, data `m3-economy-v16`, worker protocol 25. Saves are stored
without a size limit, in chunks over IndexedDB and SQLite (D-170).

## B12. Performance, measurement and tests

### B12.1 Node figures are diagnostics *(v2.19 §17J.6)*

Each stage reports Node per-day p50/p95/p99 and a per-phase breakdown at full scale.
Node results are diagnostics; on-device performance is measured by the designer and
is not claimed by implementation reports. Baseline on 2026-11-02 (current 1900 world,
359 blocks, 548 buildings, Node 22 on Windows desktop): p50 657 ms, p95 1,026 ms per
simulated day.

Device testing belongs to the designer; no report claims device behaviour or performance
(`AGENTS.md` §2, §4). The measuring protocol is handbook §6.

### B12.2 Device targets *(v2.13 §14.4)*

Initial engineering targets, to be confirmed on a named reference device:

- Simulation tick p95: at most 8 ms for the full-scale reference world.
- UI: target 60 fps, with no persistent stutter when simulation runs.
- Cold start: under 2.5 seconds on the reference device, subject to measurement method.
- Peak memory: under 250 MB on the reference device.
- Save size: target under 4 MB for the **canonical uncompressed save string** for the initial full-scale world; compressed/base64/storage/bridge sizes are separate measurements. Revise only after measuring real state. **Current Batch 3 (D-065):** the bounded 1,200-summary fixture is 2.04 MiB canonical after retaining 12 detailed months and compacting older months to exact per-country fiscal/flow totals. The full campaign was not rerun; the prior M6 18.76 MiB measurement is the before value.
- Sustained 10 days/second: battery drain target no more than twice measured idle drain under a controlled test.

Record device model, OS, build type, world size, warm-up, test duration, p50/p95/p99 tick times, snapshot rate, memory, and battery conditions. A Node benchmark is a fast regression test, not proof of mobile performance. Validate performance on-device in a release build. Current M2.1/M3f/M4b/M4c Node benchmarks (which also exercise worlds carrying the M4a-1/M4a-2/M4b/M4c state schema) do **not** evaluate or pass the mobile p95 target; its status remains **NOT EVALUATED**. The M4b close benchmark times only the period close, and the M4c fiscal benchmark times the integrated fiscal day; world cloning, setup, and hashing are excluded from both.

At high speeds, batch ticks only up to a small execution budget before yielding to the runtime. Batching may delay snapshots but must not change tick order or outputs. Do not use `performance.now()` inside the simulation package to decide game outcomes; wall-clock budgeting belongs in the driver.

> **Status and amendment.** All device targets are **not evaluated** (v2.19 §20.1 #12). The tick
> target of 8 ms was written for the 16-region sample world; it is superseded by the desktop budget
> of the approved program (D-172, decision 1): the worst day at most 200 ms and the mean day at
> most 120 ms on the reference desktop of D-161, view deltas included *(program §4.5)*:

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

### B12.3 Mandatory tests *(v2.13 §16.2)*

1. **Calendar:** exact mapping and leap-year tests through the terminal boundary.
2. **Determinism:** same initial state, seed, data, and actions produce the same world hash after a known sequence of ticks; compare repeated runs and save/resume runs.
3. **Serialization:** serialize/deserialize preserves authoritative state and typed-array semantics; invalid/corrupt saves fail safely.
4. **Population conservation:** world population changes only through births, deaths, and explicitly recorded migration or external migration; annual ageing, migration, and profession changes conserve people. **Current M5:** migration flows between population blocks conserve exact integer population and preserve per-block sex/age cell non-negativity; tests cover origin/destination sums, zero-population sources, destination inflow caps, and calendar boundaries.
5. **Employment conservation:** no worker is assigned to more than one job; assignment never exceeds available workforce or job slots.
6. **Goods conservation:** market inventory reconciles with opening stock, production, imports, use, exports, and recorded losses. **Current M5:** each market's inventory is conserved independently; a shared market's stock is counted once across its regions, and no duplicates or negative lots are permitted.
7. **Money/accounting conservation:** each posting balances; transfers have counterpart accounts; money supply changes only through defined mechanisms. **Current M5:** `migration-transfer` is a balanced, cash-neutral household-to-household transfer and is not a period flow kind.
8. **No-arbitrary-pools check:** known point pools are forbidden; derived indicators must be rebuildable or explicitly documented.
9. **Market behavior:** prices respond in the correct direction to persistent supply/demand shocks, remain finite/positive, and are bounded per tick.
10. **Finance behavior:** debt issuance, interest, maturity, taxes, transfers, and default reconcile on controlled test fixtures. **Current M4c:** income-tax withholding, welfare payment/shortfall, treasury reconciliation, fiscal cash neutrality, country close, and the four-flow summary contract are covered; debt, interest, maturity, refinancing, arrears, and default are now covered by M5b focused tests. M5a and M5b are implemented; M7a/M8a remain future. **Current M5:** each country's treasury reconciles only with its own residents' taxes, shared markets do not merge treasuries, and M4b monthly close/cash/identity tests still pass across countries. **Current M5a:** private distributions and state-enterprise remittances are backed only by positive retained profit and available cash, preserve the accounting identity and aggregate cash, do not create a flow kind, reject duplicate execution, and do not change M4b/M4c results when disabled. **Current M5b:** issuance/principal/interest financing and debt service reconcile against identified issuer/holder accounts, preserve aggregate cash, keep borrowing and principal outside revenue/expense, and cover interest, maturity, refinancing, arrears, default write-down, financing constraints, atomic rollback, save/resume, and deterministic replay. **Current M6:** player and AI fiscal-policy actions share one validator, invalid actions leave the world unchanged, AI proposals use only own-country/public observation, zero invalid AI actions are accepted in the sample campaign, AI state round-trips and hashes, goal/schedule state is fixed-size, and the historical sample's AI run remains deterministic across replay and save/resume.
11. **Calibration:** world/country anchors are within source-backed tolerances for a named baseline scenario.
12. **Regression:** each discovered bug gets a test that fails before the fix and passes afterward.
13. **Performance:** benchmark representative and worst-case fixture worlds; report p50/p95/p99 rather than only a single average.
14. **UI isolation:** app UI modules cannot import or mutate live simulation implementation/state.
15. **Worker integration:** command ordering, snapshot delivery, error handling, and save/load work on target platforms.

> **Amended by D-172.** Decision 2: invariants, conservation and statistical envelopes are the
> main regression guard; hash pins of the 1900 world stay for replay and save equality within a
> build. From S3 the tests run in three tiers: fast (every change), world (before a commit to
> `main`) and Observatory (nightly, many seeds over 10 to 100 years against envelopes) (program
> §15). Every stage adds the tests of handbook §7: unit tests of each new rule, a conservation test
> for each quantity it moves, a determinism test, a save round trip and a regression test for each
> bug found.

### B12.4 Benchmark fixtures *(v2.13 §16.5)*

Provide at least three fixtures:

- **Minimal:** one country, one market, one region, a few pop blocks and buildings.
- **Representative:** eight authored polities and the initial target scale of regions/pop blocks.
- **Stress:** full target scale, maximum permitted pop blocks, active markets, dense employment assignment, and ongoing AI evaluations.

Benchmarks must state the exact seed, data version, tick count, hardware/runtime, and measurement procedure. Performance targets are not allowed to be “verified” on a different test scale without stating the difference.

> **Note.** The fixtures named there were those of the eight-polity sample, removed in D-155; the
> 1900 world is the reference today, and S3 replaces the fixtures with the test tiers.

## B13. Sovereignty, control and dependencies

### B13.1 Occupation and territorial change *(v2.19 §11.5)*

Occupation must not silently change sovereignty. Track controller, legal owner/sovereign, start date, and relevant occupation effects separately. Annexations, independence, partition, and border changes are explicit dated events with updates to region ownership, markets, pop records, buildings, treaties, and finances.

### B13.2 Sovereignty and military control *(v2.19 §17H.1)*

| Concept | Authoritative record | Changes when |
|---|---|---|
| Sovereignty | `Country.regionIds` | Only a validated peace-treaty cession |
| Temporary military control | `Region.controllerCountryId` (+ `occupiedSinceDay`) | Occupation, liberation, or peace |
| Market membership | `Region.marketId` | Never in M10 (occupation or cession) |
| Customs administration | `Market.customsCountryId` | Never in M10 |
| Buildings and inventories | `BuildingInstance` and market lots | Never in M10 |
| Population location/identity | `PopBlock.regionId` and household identity | Never in M10; only recruitment moves people to an army roster |
| Accounts, cash, treasuries, debt | `World.finance` / `Country.treasuryAccountId` | Never on occupation or cession |
| Monetary authority | `World.monetary` currency records | Never on occupation or cession |
| Laws, regime, jurisdiction | `Country.laws`, `regime`, institutions | Never in M10; a ceded region is governed by the receiving sovereign's existing country record |

`regionSovereignCountryId` resolves ownership from `Country.regionIds`;
`regionControllerCountryId` resolves the occupier or the sovereign. Occupation requires an
active war with the sovereign and no defending sovereign army in the region. Peace clears
both sides' occupations. Cession is offered only for regions the offering side actually
controls, and a country cannot cede its last region (every country retains at least one,
per existing validation).

> **Amended by D-118.** Provinces replace regions: sovereignty is province ownership and
> occupation is province control (B5.3 rule 2). The record names in the table are those of M10.

### B13.3 Classification of the 1900 polities *(v2.19 §17I.1)*

The campaign still begins on **1 January 1900**. The playable world is built from
an authored catalog at
`packages/data/data/historical/m11/polities_1900.json`. The catalog distinguishes:

| Status | Meaning | Selectable |
|---|---|---|
| `independent` | Sovereign state with no superior power on 1 January 1900 | yes |
| `personal-union` | Separate state institutions under a shared crown (Norway–Sweden) | yes |
| `autonomous-vassal` | Self-governing but tributary (Bulgaria, Crete) | yes |
| `dominion` | Self-governing colony with responsible government (Canada, Australia, New Zealand, Newfoundland) | yes |
| `self-governing-colony` | Representative government without dominion status | no |
| `protectorate` | Local ruler under a protecting power's foreign-affairs control | no |
| `colony` | Administered dependency without sovereign status | no |
| `occupation` | Recognised government under foreign military occupation (Cuba) | no |
| `autonomous-province` | Autonomous province under suzerainty (Egypt, Finland, Tibet) | no |
| `dependency` | Other dependency (Iceland, Greenland, the Faroes) | no |

Independence coding follows the Gleditsch–Ward / Correlates of War tradition that
CShapes 2.0 documents. The catalog is authored, not copied from CShapes. Every
independent state in the documented classification is selectable. The four
semi-sovereign categories are selectable only where the catalog records a
separate government that can be simulated as a country; the decision and its
reason are visible in the picker.

The catalog contains **67 states** and **66 dependent territories**. **66 states
are selectable**; Cuba is present as an occupied polity and is not selectable.
The M11b addendum (§17I.7) records the complete independent-state reconciliation.
Each entry records a stable id, the historical name, a common English name,
status, parent sovereign, capital, 1900 population estimate with confidence,
continent, market, description, notes, sources and a geometry crosswalk.

## B14. How work is done

The code-agent contract of v2.19 §18 and the handoff procedure of §20.3 are superseded by
`AGENTS.md` §7 (the same rules), the Statecraft handbook §5 (the workflow of a stage) and the stage
prompt in `docs/statecraft/README.md`. Decisions and deviations are recorded in `DECISIONS.md`.

---

# Part C — Systems

Each section says what exists today and by which milestone or stage, what comes next, and where
the specification is. "Archive" means `docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md` unless
another edition is named. The figures are those of the P7 close (program §1,
`docs/P7_COMPLETION_REPORT.md`).

## C1. World and map

**Today.** The campaign starts on 1 January 1900 from the M11 catalog of 67 states and 66
dependent territories; 66 states are selectable (M11, D-086 to D-100; B13.3). Provinces are the
only unit beneath a country (P2, D-118): 1,687 provinces in 63 customs territories, with HYDE 3.3
population and land and USGS deposits (D-121). The 1900 map is offline and rendered with WebGL; its
pipeline reproduces the committed map (D-171).
**Next.** S9 infrastructure and market access; S13 heritage and faith data; S15 new polities.
**Specification.** Archive §17I, §5.4.4; `docs/MAP_DATA.md`, `docs/MAP_RENDERING.md`,
`docs/HISTORICAL_DATA_PROVENANCE.md`; data in `packages/data/data/historical/`, map in
`packages/app/src/map/`.

## C2. Population and demography

**Today.** 20,741 population blocks (province, profession, settlement) with single-year male and
female ages; sixteen professions (P7). Demography is caused by simulated conditions, from sourced
1900 levels (P4, D-142, D-144); needs, wealth and housing (P6, D-153); mobility and migration by
expected income (P7, D-154, D-169). **Known fault:** in a ten-year run without the player the
lower stratum falls below subsistence within five years and population falls 8.4 % (P7 report
§4.2).
**Next.** S1 a stable economy; S2a and S2b monthly demography and cohorts; S13 heritage and faith.
Calibration targets of v2.13 §15.3 are provisional; S3's Observatory measures against envelopes.
**Specification.** Archive §6, §5.4; `docs/PROSPERITY_PROGRAM.md` (P4, P7); code
`packages/sim/src/population/`, `packages/sim/src/economy/mobility.ts`.

## C3. Economy

**Today.** 61 goods (P5b, D-147 to D-152; the fibre good D-166). Buildings placed from sourced
1900 output. Land, harvests, own consumption and deposits (P5a, D-143). Engel demand with saving
and owner-occupied housing (P6, D-153). A labour market with wages, staffing ceilings and
vacancies (P7, D-154). Each customs territory is a market cleared daily with bounded price steps
and allocation by provisional priority tiers (B6.3). Trade between markets on routes with transit and tariffs (E6a, D-079; routes
generated in P2). Public construction and industrial policy (E3, E4, D-074, D-075); no private
investment. **Known fault:** the economy does not hold over ten years (C2; P7 report §4.2).
**Next.** S1 (diagnosis and structural fixes), S2a and S2b (weekly market rounds), S9 transport,
S10 firms and investment, S12 production methods.
**Specification.** Archive §7, §17A.6 to §17A.8, §17A.20, §17F; `docs/PROSPERITY_PROGRAM.md`; code
`packages/sim/src/economy/day.ts`, `market.ts`, `labourMarket.ts`.

## C4. Money, accounting and public finance

**Today.** A double-entry ledger in RUSD with monthly and annual closes and audited corrections
(M4, M7a, D-047, D-072). Players see their own currency (P3, D-140, D-141). Income tax with an
exemption, a business-profit tax, a welfare budget and a reserve target (M4c, E2, D-048, D-073).
Public debt with interest, maturity, refinancing, arrears and default (M5b, E2, D-057). A price
index and a reserve-backed monetary authority (E6b, D-080); gold and silver standards, the mint
and the currency actions (P5b, D-147 to D-151). No banks, credit or interest rate.
**Next.** S2b weekly journals; S11 banks, credit, bonds and gold; S22 war finance.
**Specification.** Archive §8, §5.4.1 to §5.4.6, §17A.5, §17A.10, §17B, §17G; code
`packages/sim/src/economy/fiscal.ts`, `debt.ts`, `monetary.ts`, `mint.ts`.

## C5. Politics and institutions

**Today.** Three regime templates, seven interest groups, twenty laws in four active slots,
elections, regional unrest, crisis and revolution, a staffed administration (M8, D-076); minimum
wage and working hours (E5, D-078). Three scripted events.
**Next.** S14 politics (beliefs, movements, parties, cabinet, laws, elections), S15 stability and
regime change. The scripted events go when S14 replaces them (D-172).
**Specification.** `docs/statecraft/ACT_4_NATIONS.md`; archive §9, §17C, §17E; code
`packages/sim/src/economy/politics.ts`, data `packages/data/data/politics.json`.

## C6. Technology and education

**Today.** 125 technologies, of which 74 are flat sector-productivity bonuses; one research
project per country, worked only by funded academics; an education institution and age-specific
literacy (M9, D-077); vocational training and public health (E5, D-078).
**Next.** S12 knowledge: fields, inventions, diffusion and production methods. The flat-bonus data
goes then (D-172).
**Specification.** `docs/statecraft/ACT_3_GROWTH.md`; archive §10, §17D, §17E; code
`packages/sim/src/economy/technology.ts`, data `packages/data/data/technology.json`.

## C7. Diplomacy

**Today.** Wars, truces and peace offers only (M10, D-081). No treaties, alliances, subjects or
crises.
**Next.** S16 diplomacy, S17 crises and the strategic AI, S18 the road to war.
**Specification.** `docs/statecraft/ACT_5_CONCERT.md`; archive §11.1, §17H.

## C8. War

**Today.** M10 (D-081): five actions (declare war, offer peace, accept peace, recruit an army,
deploy an army); armies are rosters recruited from working-age people; equipment comes from a
non-simulated supplier; hostile armies in one province fight daily; occupation changes control,
never sovereignty (B13). No supply, terrain, navy or air. The AI never declares war or recruits.
**Next.** S19 to S23 replace the M10 code (D-172).
**Specification.** `docs/statecraft/ACT_6_TOTAL_WAR.md`; archive §11, §17H; code
`packages/sim/src/economy/military.ts`.

## C9. Country AI

**Today.** The M6 planner is rule-based, evaluated every seven days and staggered by country id;
it sets the income tax and the welfare budget and nothing else (D-058). It reads only its own
country's observation, and the player's country is exempt (D-063; B9.4). Of the design's
priority list (B9.3), only the first two items have actions.
**Next.** S8 cabinet AI for every existing lever, with reasons; S17 strategic AI. The M6 planner
goes then (D-172).
**Specification.** `docs/statecraft/ACT_2_GAME.md` (S8), `CONTRACTS.md` §9; archive v2.13 §12;
code `packages/sim/src/economy/ai.ts`.

## C10. Interface

**Today.** The Living Atlas shell (M16, D-112): landscape on every device, the map always the
screen, thirteen ledger screens as sheets over it in four domains (Realm, Economy, Society,
World), a HUD of treasury, people and hardship, a title screen and a saved-game library. The
labour market reached the phone in P7 (D-156). The worker sends a full snapshot each day (protocol
25). Nothing asks the player for a decision. Device tests of P7 belong to the designer and have
not been reported.
**Next.** S4 the shell (Desk, Timeline, five domains, lenses, place sheet), S5 legibility, S7
ambitions and onboarding; S2c views replace the snapshot.
**Specification.** `docs/statecraft/ACT_2_GAME.md`; `AGENTS.md` §2; code
`packages/app/src/screens/GameShell.tsx`, `packages/app/src/design/tokens.ts`,
`packages/sim-worker/src/protocol.ts`.

## C11. News

**Today.** None: a status line and dispatch names.
**Next.** S6 the Gazette: world events, newspaper, ticker, briefing, chronicle.
**Specification.** `docs/statecraft/ACT_2_GAME.md` (S6), `CONTRACTS.md` §8.

---

# Part D — Glossary

## D1. Words of the game *(handbook §10)*

| Word | Meaning |
|---|---|
| Wheel, slot, job | The scheduler's cadences (day, week, month, year), the position of an entity on a wheel, and a registered piece of work (CONTRACTS §1) |
| Market day, round | The weekday on which a customs territory clears its markets; the week's clearing |
| Cohort | Blocks of one customs territory that share an income bin and settlement, cleared together |
| Block | A population block: province × profession × settlement, with single-year ages |
| View | A named, subscribed payload the worker sends to the interface |
| Indicator | A figure with a definition, unit, period and attribution |
| Attribution, "why" | The decomposition of an indicator into causes |
| First-order effect, projection | The immediate analytic estimate of an action; the forward run on a copy |
| Decision journal | The record of decisions with their forecasts and outcomes |
| Desk, card | The player's agenda; one decision, crisis or report on it |
| Timeline | The strip of dated things to come |
| Lens | A map mode with a legend and a reading |
| Place sheet | The panel for a province or country in the terms of the active lens |
| Gazette, world event, chronicle | The newspaper; a typed event emitted by the simulation; the stored history |
| Ambition, mandate | A goal on a real statistic; a government's promises to its coalition |
| Heritage, faith | Ethnolinguistic community; religion. Never "race" |
| Pillar | A body whose consent a regime needs: crown, army, church, landowners, party |
| Interest, dispute, crisis | A declared stake; a contested object; a dispute someone has acted on, with a clock |
| Prestige | Other governments' estimate of a state's resolve and capability; derived, never spent |
| Class of (year) | A birth cohort of a province, for military service |
| Pattern | A division's establishment table |
| Operation | An objective, forces and preparation on a front |
| Observatory, envelope | The batch runner and its report; a band a metric must stay in |
| RUSD | Reference US dollars of 1990, the simulation's unit. The player sees local currency |

## D2. Terms of the simulation *(v2.19 §21)*

Entries quoted unchanged:

- **Authoritative state:** runtime data that determines the simulation result and cannot be reconstructed from other stored data without loss.
- **Cache:** derived data retained for speed or presentation; it can be rebuilt from authoritative state.
- **Civil day:** a calendar day determined by the Gregorian calendar, independent of device time zone.
- **Day index:** integer index for the next civil day to process.
- **Funded demand:** demand that a buyer can actually pay for under current rules.
- **Historical shock/event:** a dated or trigger-based event that changes underlying conditions, not a forced final outcome.
- **Single-year age state:** the authoritative per-sex array of 81 counts; indices 0–79 are exact ages and index 80 is the open-ended 80+ group.
- **Five-year band:** a reporting/validation aggregate derived from single-year age state; never separate authoritative population.
- **Historical-validation scenario:** a run initialized from a source-backed historical date and age/sex distribution, used to test whether source-backed schedules reproduce history.
- **Gameplay baseline:** a scenario with explicitly provisional or designed assumptions, used for play; it is not automatically a historical validation.
- **Currency issuer:** the entity that issued a currency: a simulated country, an explicitly represented foreign issuer, or a future union. Adoption does not change issuer identity.
- **Domestic monetary arrangement:** a country's sole `own` or `adopted` selection of a currency for domestic use; it is not the same as issuer identity.
- **Currency valuation:** the single `CurrencyValuation` record for a currency, either specified (`rusdPerUnit`, `setOnDay`, scenario source) or explicitly unavailable. It never defaults to parity.
- **RusdPerCurrencyUnit:** the RUSD value of one unit of a currency. It is a valuation input, not by itself a peg; it is serialized as a plain JSON number and branded in code.
- **Nominal RUSD:** an amount measured in the fixed RUSD unit without inflation adjustment.
- **Real purchasing power:** a future derived measure of what nominal RUSD can buy, using a documented price index or reference period; it is not the same as nominal RUSD.
- **Finance period summary:** the immutable `FinancePeriodSummary` recorded at a monthly close: inclusive period start/end, the pre-close trial balance of nonzero accounts, and the four mapped gross period-flow totals.
- **Period close:** the M4b month-end operation that captures a finance period summary, zeroes revenue and expense accounts with closing entries into existing owner equity, and advances `FinanceState.closedThroughDay`.
- **Closed-through day:** `FinanceState.closedThroughDay`, the inclusive end day of the most recently closed period, or `null` before the first close. A published world requires it to be `null` or earlier than `world.dayIndex`.
- **Staged close / published close:** a staged close is the in-progress result on a copied finance state and may temporarily have `closedThroughDay === world.dayIndex`; a published world requires `closedThroughDay === null || closedThroughDay < world.dayIndex`.
- **Semantic posting matrix:** the D-047/D-048 rule set that fixes which account subtypes each transaction kind may debit or credit; it applies to revenue and expense lines in single, batched, and persisted postings.
- **Fiscal policy:** the M4c provisional `Country.fiscal` state: a flat dimensionless `incomeTaxRate` on actual wages and a nominal annual `welfareBudgetRUSDPerYear` expenditure target. It is scenario-initialised state, not a spendable pool, and is not law-bounded or action-mutable in M4c.
- **Treasury:** the country-owned `treasury-cash` asset account that receives income-tax proceeds and pays budgeted welfare. Its balance is authoritative cash, not a capacity or policy pool.
- **Welfare shortfall:** the difference between a country's requested daily welfare budget share and the amount actually payable from treasury cash. It is reported for diagnostics and is not a debt, arrear, or liability in M4c.
- **Technology project work:** cumulative record of research labor applied to one specific technology.
- **Tick:** one simulation update for one civil day.
- **Trailing-month income average:** a monthly average of household income over the preceding civil month. M3f does **not** implement this; its monthly wealth convention annualizes one day's actual settled wages.
- **Annual finance summary:** the compact, immutable record appended after the 31 December monthly close. It holds annual tax/welfare/interest/net flows, the four world gross flows, year-end treasury/debt/interest balances, and the world-wide correction count; it holds no account trial balance.
- **Controlled correction:** a new audited finance posting that names an original posting and a reason. It is applied atomically, never edits a closed summary, and lands in the current open period if it concerns the past.
- **E stage:** one Economic Management implementation stage (E1–E6, with E5a/E5b and E6a/E6b substeps). E0 is the design specification. E1, E2, E3, E4, E5, E6a, and E6b are implemented. E stages are not renaming or replacing M milestones.
- **Taxable base:** the actual measured quantity a tax applies to (wages received, taxable profit, eligible transaction value, assessed property/land value, or dutiable trade value). A rate without a defined base is not an implementable tax.
- **Public investment project/construction queue:** a planned asset with explicit money/labor/material/time requirements and progress; completion creates an actual building/infrastructure asset, not an instant bonus.
- **Policy action:** a validated, deterministic command that changes a defined authoritative policy field/rule through the shared player/AI action path. It does not mutate the live world directly from the UI.
- **Monthly economic report:** a bounded, derived presentation summary of the month's economic changes, actual revenues/expenses, player actions/projects, completions, and supported explanations. It is not a second authoritative economy or per-day history.
- **Public enterprise:** a state-owned productive asset/enterprise with explicit capital, operating cash, profit/loss, and remittance rules. Creation/expansion is not implemented; remittance mechanics exist where state ownership is present.
- **Tariff/customs duty:** a tax on an actual import crossing a defined customs boundary. **Implemented in E6a (D-079):** an ad-valorem charge on the origin-market cargo value of each shipment entering a market whose customs administration differs from the origin market's; it is never attached to shared-market clearing.
- **Trade route:** authored, validated geography connecting two markets, with a provisional distance and a base daily cargo-value capacity that is scaled by both markets' infrastructure. It is a constraint, not a resource, and there is no multi-hop routing.
- **Monetary authority:** an institution/law-backed actor with explicit instruments and channels; not an arbitrary slider. **Implemented in E6b (D-080)** as a reserve-backed currency board for own-currency countries, with a law-gated managed regime, bounded parity policy, and balanced accounting; commercial banking and credit remain missing prerequisites.
- **Real vs nominal:** nominal values are measured in fixed RUSD; real values require a documented price index/base. **E6b (D-080)** implements a Laspeyres price index with a fixed needs-derived basket, base 100 at the scenario start, bounded month-end observations, and coverage; it is a measured nominal price-level comparison, not a full deflator, and it does not index any contract or account.
- **Vertical slice:** the smallest playable end-to-end version that proves the complete product path rather than only isolated systems.

Entries that later decisions changed (the v2.19 wording is in the archive):

- **Market:** a customs territory with one tariff authority, shared by its provinces (D-119;
  B5.3).
- **Pop block:** aggregate population of one province and profession, with single-year male and
  female ages (D-117); the program's "block" (D1).
- **RUSD:** the simulation's unit of account, with the purchasing power of one US dollar of 1990;
  not a national currency, legal tender or the simulated US dollar (D-122; B7.1).
- **Country-province ownership:** a country's territory derives from the provinces it owns
  (D-118); it replaces country-region ownership.
- **Current implementation:** the behaviour that the code and its tests deliver today, as
  distinct from provisional rules and future systems (front matter).
- **Customs administration:** the authority of a customs territory over its frontier and tariff
  (D-119).
- **Sovereignty:** the country that legally owns a province; it changes only through a validated
  peace-treaty cession (M10, D-081; D-118).
- **Military control / occupation:** temporary effective military control of a province by an
  at-war country, recorded separately from sovereignty; it never changes sovereignty, markets,
  buildings, people, accounts, treasuries or monetary authority (D-081; D-118; B13.2).
- **Occupation:** temporary military control of a province by an at-war country; it applies unrest
  and a garrison cost to the controller but transfers no ownership or economic state (D-081;
  D-118).
- **Whole-day staging:** the M3 to P0 rule of running a whole day on a structural clone;
  superseded by phase validation and checkpoint rollback (D-116; B6.2).

The entries "Planned intermediate stage" and "Economic Management Overhaul" described the roadmap
of v2.19 and are in the archive.

---

# Part E — Concordance of old section numbers

Every section of GDD v2.19, and every section lost from the GDD in v2.14, and where its content is
now. "Archive v2.19" is `docs/archive/gdd/Fabric_of_Nations_GDD_v2.19.md`; "archive v2.13" is
`docs/archive/gdd/Century_GDD_v2.13.md`. Text that is only in an archive is kept there unchanged
and is binding only as far as the other parts of this document quote it. Code
comments and older decisions that cite "GDD §n" mean the section of the edition current when they
were written; this table finds it.

| Old section | Lines | Now |
|---|---:|---|
| Title block | 11 | Front matter (version 3.0); the v2.5 to v2.19 alignment notes and M5 to M7 addenda that followed it (364 lines): archive v2.19 |
| Document purpose and authority | 25 | Front matter (the four kinds of requirement and the order of precedence, verbatim), below the authority order of handbook §2 (D-172) |
| Contents | 28 | Replaced by the contents of v3.0 |
| §1, §1.1 Vision, §1.2 Design pillars | 19 | A1, A2 (verbatim) |
| §1.3 Product definition | 10 | A4 (verbatim; the regions and cadence lines amended by D-118 and D-172) |
| §1.4 Economic management design objective | 30 | A5 (the objective and the loop, verbatim); the closing cross-references: archive v2.19 |
| §2 No-Mana (§2.1 to §2.3) | 33 | B1 (verbatim, unchanged) |
| §3.1 to §3.3 Calendar, speeds, clocks | 35 | B2 (verbatim) |
| §3.4 Evaluation cadence | 26 | B3 (verbatim; binding until S2, then program §4 by D-172 decision 1) |
| §4.1 Pure simulation boundary | 10 | B4.1 (verbatim) |
| §4.2 Mandatory daily pipeline | 172 | B4.2 (the rule, verbatim; the step list was last updated at P1b and is in the archive v2.19); whole-day staging superseded by D-116 (B6.2) |
| §4.3 Scarcity and allocation | 30 | B6.3 (verbatim, without the M3 status paragraph); the M3 status: archive v2.19 |
| §4.4 Month and year boundaries | 9 | B2.4 (verbatim) |
| §5.1 General rules | 12 | B5.1 (verbatim) |
| §5.2 Core primitive types | 29 | B7.1 (the RUSD definition, verbatim, with D-122); the type list: archive v2.19 |
| §5.3 Static definitions, §5.4 Runtime state, §5.4.1 to §5.4.6, §5.5 Minimum supporting contracts | 1,086 | archive v2.19 (the M-era data model; parts superseded by D-117 and D-118; the code and `CONTRACTS.md` §14 are current); Part C points here |
| §5.6 Static/runtime split and serialization | 10 | B5.2 (verbatim; the migration sentence amended by D-013 and the no-legacy-saves rule, B11) |
| §6.1 to §6.5, §6.8 Population, needs, wealth, mobility | 135 | C2; archive v2.19 |
| §6.6 Demographics | 51 | C2; superseded in direction by D-124 (B8.3); archive v2.19 |
| §6.7 Employment and labor allocation | 14 | B6.4 (the employment rules, verbatim); C3; archive v2.19 |
| §7.1 to §7.3, §7.5 to §7.8 Goods, buildings, markets, prices, wages, GDP | 200 | C3; archive v2.19 |
| §7.4 Markets and trade zones | 18 | C1, C3; superseded by D-119 (B5.3); archive v2.19 |
| §8 introduction | 11 | archive v2.19 |
| §8.1 Accounting principles | 50 | B7.2 (the principles, verbatim); the M4 to E6b status paragraphs: archive v2.19 |
| §8.2 to §8.6 Accounts, revenue, expenditure, debt, prices and currency | 197 | C4; archive v2.19 |
| §8.7 Finance invariants | 37 | B6.5 (the invariants, verbatim); the status paragraph: archive v2.19 |
| §9 Politics and institutions | 51 | C5; archive v2.19 |
| §10 Technology and education | 32 | C6; archive v2.19 |
| §11.1 Diplomacy | 12 | C7; archive v2.19 |
| §11.2 to §11.4 Military, combat, war termination | 14 | C8; archive v2.19 |
| §11.5 Occupation and territorial change | 15 | B13.1 (the rule, verbatim); C8; archive v2.19 |
| §12 Country AI (heading, status paragraph, and the §17 status and milestone tables the v2.14 edit left under it) | 64 | C9; the tables: archive v2.19 |
| §17.1 to §17.5 M3 to M7 records, intermediate stages, dependency plan, E0 to E6 roadmap | 535 | archive v2.19; the build order superseded by the program's roadmap (D-172 decision 4) |
| §17A heading, §17A.1 Product goal and core loop | 41 | archive v2.19 (the loop is A5) |
| §17A.2 Implementation-truth labels and authority | 31 | B9.1 (the authority rules, verbatim); the labels: front matter |
| §17A.3 Design principles | 32 | B9.2 (verbatim) |
| §17A.4 to §17A.16 The E0 specification (policy areas, interface, acceptance, stages, open questions) | 973 | archive v2.19; what remains unbuilt is in C3, C4 and the Statecraft stages they name |
| §17A.17 to §17A.20 E1 to E4 implementation records | 651 | archive v2.19 |
| §17B to §17G M7a, M8, M9, E5, E6a, E6b implementation records | 1,018 | archive v2.19 |
| §17H M10 implementation record | 115 | archive v2.19; the M10 code goes when S19 to S23 replace it (D-172) |
| §17H.1 Sovereignty and military control | 21 | B13.2 (verbatim, with D-118: provinces) |
| §17I M11 implementation record and addenda | 314 | archive v2.19 |
| §17I.1 Historical classification and the 1900 catalog | 33 | B13.3 (the classification, verbatim); C1 |
| §17I.8 Interface redesign | 31 | B10.1 (the D-112 supersession, verbatim); C10; archive v2.19 |
| §17J heading, §17J.1 Objective | 71 | A6 (the objective, verbatim); the heading's status text: archive v2.19 |
| §17J.2 Binding foundational rules | 32 | B5.3, B6.2, B7.3, B8.3, B8.4, B11.2 (verbatim, rule by rule) |
| §17J.3 Stages | 22 | archive v2.19; P0 to P7 in Part C; P8 to P15 superseded by program §5.2 (D-172) |
| §17J.4 Rollback mechanism | 8 | B6.2 (verbatim) |
| §17J.5 Companies and capital markets | 8 | archive v2.19; superseded by program §5.2 (S10, S11; D-172 decision 9) |
| §17J.6 Performance | 10 | B12.1 (the rule, verbatim); the 2026-11-02 baseline: archive v2.19 |
| §18 Code-agent execution contract | 39 | Superseded by `AGENTS.md` §7 and handbook §5 (B14); archive v2.19 |
| §19 Explicit non-goals for v1 | 43 | A7 (the list, verbatim, with the D-172 amendments); the E-stage status paragraph: archive v2.19 |
| §20.1 Design decisions already fixed for v1 | 32 | Items 2, 6, 7 and 18 in B6.4, B4.3, B4.2, B7.4; item 9 in B1.4; the rest: archive v2.19 |
| §20.2 Remaining designer decisions | 14 | A8 (verbatim, with the decisions that settled items) |
| §20.3 Handoff procedure | 15 | Superseded by the stage prompt of `docs/statecraft/README.md` (B14); archive v2.19 |
| §21 Glossary | 61 | Part D (with D-117, D-118 and D-122 where they changed a meaning) |
| **Lost from the GDD in v2.14 (archive v2.13)** | | |
| §12.1 Deterministic decision model | 32 | B9.3 (the model rules and the priority list, verbatim; to be replaced in S8); the M6 mapping: archive v2.13 |
| §12.2 AI information and reproducibility | 25 | B9.4 (verbatim) |
| §12.3 Initial action set | 14 | C9; archive v2.13 |
| §13 introduction, §13.1 Map, §13.2 Charts, §13.3 Screens | 54 | C10; superseded by M11, M16 and D-112; archive v2.13 |
| §13.4 Mobile readability | 8 | B10.2 (verbatim) |
| §13.5 Data flow and snapshots | 23 | B10.3 (the boundary rules, verbatim; snapshots become views in S2c, D-172) |
| §14.1 Monorepo layout | 29 | B4.4 (the layout, verbatim); commands in `AGENTS.md` §5 |
| §14.2 Worker technology selection | 23 | B4.4 (one thread, D-163); archive v2.13 |
| §14.3 Thread protocol | 27 | B10.4 (verbatim; the migration item amended by D-013) |
| §14.4 Performance targets | 33 | B12.2 (verbatim; the 8 ms tick target superseded by program §4.5) |
| §14.5 State management | 11 | B10.5 (verbatim) |
| §14.6 Save system | 28 | B11.1 (verbatim) |
| §14.7 History and diagnostics | 6 | B5.5 (verbatim) |
| §15.1 Dataset deliverables | 32 | C1; superseded by the M11 and P2 data; archive v2.13 |
| §15.2 Calibration philosophy | 32 | B8.1 (verbatim) |
| §15.3 Provisional aggregate targets | 22 | C2 (calibration status); archive v2.13 |
| §15.4 Employment-structure calibration | 14 | B8.2 (the definition, verbatim; D-167) |
| §15.5 Data validation | 21 | B5.4 (verbatim) |
| §16.1 Randomness | 12 | B4.3 (verbatim) |
| §16.2 Mandatory tests | 27 | B12.3 (verbatim, with D-172 decision 2 and the test tiers) |
| §16.3 Numeric safety | 9 | B4.5 (verbatim) |
| §16.4 Conservation equations | 26 | B6.1 (verbatim) |
| §16.5 Benchmark fixtures | 14 | B12.4 (the rule, verbatim; the fixtures to be replaced in S3) |
| §17 heading and preamble | 4 | Superseded by handbook §5 and `AGENTS.md` §7 (B14) |

---

**End of document.**
