# FABRIC OF NATIONS — GRAND STRATEGY 1900–2000

**Official name:** *Fabric of Nations*\
**Document type:** Game Design Document and Agent Implementation Specification\
**Version:** 2.19\
**Revision date:** 2026-11-02\
**Rebranding revision:** 2026-11-01 (M13)\
**Target platform:** iOS and Android\
**Application stack:** React Native / Expo with a versioned worker/snapshot bus (M7 implementation; native release verification pending)\
**Simulation period:** 1900-01-01 through the boundary at 2000-01-01\
**Simulation resolution:** One simulated civil day per tick

> **Name note (M13).** The game was formerly *Century*. M13 rebranded the
> player-facing application, distribution metadata and current documentation to
> **Fabric of Nations** without changing simulation behavior, save schema or
> historical starting conditions. This document keeps GDD version 2.18 because
> no game-design content changed; earlier GDD versions retain their original
> titles as archived historical documents.

> **v2.19 alignment note (Prosperity Program, P0).** The designer approved a
> peacetime economy and demography overhaul so that a country that never fights
> or negotiates is still a rewarding game. This revision adds **§17J** (binding
> summary of the program, stages P0–P15) and records the approved foundational
> decisions **D-115 to D-124**: phase validation with checkpoint rollback replaces
> whole-day staged cloning (D-116); sparse province × profession population
> blocks (D-117); provinces replace simulation regions (D-118); customs
> territories make markets national by default (D-119); the breaking schema
> change is accepted under D-013 (D-120); HYDE 3.3 and USGS are the province,
> land and resource sources (D-121); RUSD is defined as 1990 reference dollars
> and players see their own currency (D-122); companies and capital markets are
> staged after the real economy (D-123); demography becomes cause-driven
> (D-124). The rules these decisions supersede are marked in place
> (§4.2 whole-day atomicity, §6.6, §7.4, §17A.10.1, §20.1 #1/#14/#19). **No
> implementation changed in v2.19**: the marked rules remain the current
> implementation until their stage is accepted. The detailed plan is
> `docs/PROSPERITY_PROGRAM.md`; the companies proposal is
> `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md`.

> **v2.18 alignment note.** This revision records **M11 — Historical
> World, Country Selection, and Complete UI Overhaul** as implemented. The
> playable world is a 1900 catalog; with the M11b coverage addendum it contains
> **67 states** and **66 dependent territories** in **133 regions** and
> **20 documented markets**; **66 states are selectable** and every one can
> initialize a valid campaign. A new campaign begins with an explicit country
> choice on an offline historical world map, and the app is rebuilt around a
> map-first grand-strategy shell with sliders for continuous policy controls.
> Dependencies are modelled as territories of their sovereign, never as
> independent countries; D-081 sovereignty/control separation is preserved. This
> document also restores the original v2.17 file from its pre-Batch-4 commit and
> keeps the valid D-085 audit-remediation record here. The M11b addendum
> (§17I.7) adds Austria-Hungary and the documented de facto, autonomous and
> protectorate polities, and records the catalog coverage audit in
> `docs/1900_CATALOG_COVERAGE.md`. World schema is **26**, simulation **0.27.0**,
> save format **1**, data **`m3-economy-v12`**, worker protocol **16**; older
> saves and protocol-13 clients reject under D-013. The implementation record is
> §17I and the decisions
> are D-086 through D-093.
>
> **v2.17 alignment note.** This revision records **M10 — Diplomacy, Warfare, and
> Territorial Control** as implemented for GDD §11, §11.1–§11.5 and the M10
> definition of done, and resolves **CEN-AUDIT-016** by separating sovereignty from
> temporary military control:
>
> - **Sovereignty** remains the single authoritative record `Country.regionIds`.
> - **Military control** is a new per-region `controllerCountryId` plus
>   `occupiedSinceDay`; occupation never changes sovereignty, markets, buildings,
>   people, accounts, treasuries, or monetary authorities.
> - Only an explicit peace-treaty cession changes sovereignty, and only for regions the
>   offering side controls. Market membership, private ownership, and monetary authority
>   stay unchanged even then.
>
> M10 adds five validated player/AI actions (`declare-war`, `offer-peace`,
> `accept-peace`, `recruit-army`, `deploy-army`), real recruitment from working-age
> people, paid equipment and upkeep, deterministic daily combat with deaths, wounded
> returns, and captured soldiers, occupation/liberation with a garrison cost and unrest,
> white-peace and cession terms with a truce, and a minimal deterministic AI peace rule.
> No diplomatic or war-score pool exists.
>
> Commercial military industry, tactical combat, terrain/weather/fortifications, navies,
> alliances, sanctions, recognition, subject relationships, AI war strategy, and
> non-treaty annexation remain recorded missing prerequisites. World schema is **26**,
> simulation **0.26.0**, save format **1**, data **`m3-economy-v11`**, worker protocol
> **13**; older saves and protocol-12 clients reject under D-013. The implementation
> record is §17H and the decisions are D-081.
>
> **v2.16 alignment note.** This revision records **E6b — Monetary, Foreign-Exchange,
> and Price-Measurement Systems** as implemented for the §17A.10, §17A.10.1–§17A.10.4,
> §17A.13.2 E6b, §17A.14 E6b, and §17.3 M8a scope. It adds a documented Laspeyres
> price index derived from actual market prices over a fixed needs-derived basket, with
> a base-100 start, bounded month-end observations, and country/world measures; a
> reserve-backed monetary authority for own-currency countries with pegged and
> law-gated managed exchange-rate regimes; a documented bounded managed-rate rule driven
> by realized trade and relative prices; balanced currency-board accounting for reserve
> capitalization, currency issue/redemption, and parity/valuation revaluation; and a
> reserve-cover convertibility rule whose suspension blocks imports into the country's
> customs zone. RUSD remains the fixed unit of account; domestic accounts and trade are
> never redenominated or converted twice.
>
> Commercial banks, deposits, bank credit, a policy interest rate, lender-of-last-resort,
> external debt, domestic currency-denominated ledgers, and FX order books are
> explicitly deferred with recorded missing prerequisites. No country receives modern
> fiat powers by default; the managed regime requires an enacted currency law. The
> historical sample's currency valuations remain explicitly unavailable, so no authority
> is active and no historical exchange rate is invented.
>
> World schema is **25**, simulation **0.25.0**, save format **1**, data version
> **`m3-economy-v10`**, and worker protocol **12**. Older saves and protocol-11 clients
> are rejected explicitly under D-013. The E6b implementation record, material
> decisions, and remaining limitations are §17G and D-080.

> **v2.15 alignment note.** This revision records **E6a — Transport, Access, and
> Inter-market Trade** as implemented for the §17A.8, §17A.8.1–§17A.8.3,
> §17A.13.2 E6a, and §17A.14 E6a scope. It adds authored, validated transport routes
> between markets; capacity and transit time derived from route distance and the
> existing regional infrastructure quality; producer-consignment shipments with real
> stock removal, in-transit state, and exact-once delivery; a customs boundary at the
> market level with an explicit customs administration; ad-valorem tariffs, monthly
> import quotas, and export restrictions in one validated `set-trade-policy` action;
> and balanced, cash-neutral freight and customs postings reported through the
> monthly and annual fiscal summaries. Trade funds its own working capital only from
> real enterprise or owner cash; a shortfall blocks the shipment instead of creating
> a loan, payable, or negative balance.
>
> Trade agreements/market access, export incentives, a non-simulated rest-of-world
> sector, foreign exchange and external accounts, infrastructure construction, and
> in-transit spoilage are explicitly deferred with reasons. Intra-market pooled
> allocation remains shared-market clearing and is **not** dutiable. E6a does not
> implement E6b monetary foundations, FX, inflation measurement, credit creation, or
> M10.
>
> World schema was **24**, simulation **0.24.0**, save format **1**, data version
> **`m3-economy-v9`**, and worker protocol **11** in the E6a revision. The E6a
> implementation record, material decisions, and remaining limitations are §17F and
> D-079.

> **v2.14 alignment note.** This revision records **E5 — Labor and Social
> Institutions** as implemented for the §17A.9, §17A.13.2 E5, §17A.14 E5, and §17.5
> scope. It adds a funded vocational-training service with real academic instructors,
> part-time trainee participation, a treasury-limited stipend, and a new authoritative
> block qualification rate that drives actual wages and labour productivity. It adds a
> public-health service delivered by a share of the existing administration clerk base
> with a derived mortality effect. The M8 labor slot gains minimum-wage and
> working-hours laws, and the health slot gains a public-health law with a minimum
> staff share. Pensions/social insurance, collective bargaining, labour-market
> enforcement, cross-profession promotion, and practitioner-level medical staffing are
> explicitly deferred. E5 does not implement E6 trade/monetary mechanics or M10.
>
> World schema was **23**, simulation **0.23.0**, save format **1**, data version
> **`m3-economy-v8`**, and worker protocol **10** in the E5 revision. The E5
> implementation record, material decisions, and remaining limitations are §17E and
> D-078.

> **v2.12 alignment note.** This revision records **M8 — Laws and Institutions** as
> implemented for the §9.1–§9.5 scope and the §17 M8 definition of done. It adds
> authoritative regime, law, law-transition, interest-group, and institution state;
> regional unrest and infrastructure; a world-level scripted-event queue with
> provenance; a daily politics phase; validated `propose-law` and
> `set-institution-funding` player actions; administration payroll; and the derived
> effects of institutional quality/overload on tax collection, construction, law
> enactment, and unrest. Elections use the suffrage law and enfranchised population;
> sustained simulated pressure can produce a regime crisis and revolution. Interest
> groups and influence are derived and unspendable; no political-point pool exists.
>
> Only the taxation, suffrage, education (added by M9), labor, and trade law slots
> have implemented, proposable options. Health, military service, colonial policy,
> and currency remain explicit E5/M10/E6b dependencies with no decorative controls.
> The trade law currently governs migration access only; tariffs, customs, and trade
> agreements remain E6a. Minimum wages, hours, bargaining, and social insurance
> remain E5. AI law proposals and player crisis-response actions are deliberately not
> implemented.
>
> World schema was **21**, simulation **0.21.0**, save format **1**, data version
> **`m3-economy-v6`**, and worker protocol **8** in the M8 revision. The M8
> implementation record, material decisions, and remaining limitations are §17C and
> D-076.

> **v2.11 alignment note.** This revision records **E4 — Industrial and Business
> Policy** as implemented for a coherent scoped subset: an explicit validated
> building-sector taxonomy, construction/commissioning material requirements bought
> from actual regional market stock with balanced purchase postings, a sectoral
> production subsidy paid against verified output and limited by actual treasury
> cash, and public-enterprise capital support. Construction now requires both paid
> idle labor and delivered materials; completion capitalizes both. The subsidy is a
> real treasury expense and enterprise revenue, included in the business-tax base;
> unpaid entitlement is an explicit shortfall. Public-enterprise support is a capital
> contribution, not an expense, loan, guarantee, or promise of profitability.
>
> Private co-financing, government-supported private projects, loans, guarantees,
> investment tax credits, industrial program bundles, public-enterprise expansion/
> discontinuation, and price/production controls are **not** E4 in this revision.
> They are labelled dependencies rather than decorative controls.
>
> World schema is **20**, simulation **0.20.0**, save format **1**, data version
> **`m3-economy-v5`**, and worker protocol **7**. The schema adds
> `Country.industrial`, construction material state, subsidy/support budget fields,
> and the new industrial posting kinds; the data change adds a validated sector and
> construction-material bill to every authored building definition. Canonical hashes
> and known-answer fixtures change intentionally; incompatible saves are rejected
> under the existing policy. The E4 implementation record is §17A.20; the material
> decisions are D-075. E1–E3 and M7a records remain historical records of their
> revisions.
>
> **v2.10 alignment note.** This revision records **E3 — Public Investment and
> Construction** as implemented. E3 adds a validated public-construction project
> queue, actual idle-labor hiring and daily wage payment, deterministic
> work-in-progress progress, completion into a state-owned productive building with
> definition capacity, pause/resume/cancel, funding/labor stalls, bounded retention,
> immutable-snapshot UI, and save/replay. Construction is capitalized rather than
> expensed: daily gross construction wages accumulate in a country
> `construction-in-progress` asset and are reclassified to `public-capital` on
> completion; cancellation writes the spent work-in-progress off to country equity.
> A completed building receives a cash-limited working-capital endowment and then
> participates in the ordinary production, employment, market, tax, and
> state-remittance systems. E3 deliberately scopes **money + idle labor + time**:
> the current data has no construction bill of materials or government procurement
> demand, so material consumption, subsidies, private co-financing, public-enterprise
> operation/expansion policy, and transport-dependent infrastructure remain
> dependencies of E4/E5/E6a. E3 does not add any E4–E6 mechanic.
>
> World schema is **19**, simulation **0.19.0**, save format **1**, data version
> **`m3-economy-v4`**, and worker protocol **6**. The schema change adds the
> construction project queue/history, two country asset accounts, four cash-neutral
> posting kinds, and construction budget fields; canonical hashes and known-answer
> fixtures change intentionally, and incompatible saves are rejected under the
> existing policy. The data-version bump is required because every authored building
> definition now carries a construction crew and permits state ownership. The E3
> implementation record is §17A.19; the material decisions are recorded in D-074.
> E1, E2, and M7a records remain historical records of their revisions.
>
> **v2.9 alignment note.** This revision records **E2 — Fiscal Management** as
> implemented. E2 extends the existing M4c fiscal loop into a public budget: an
> income-tax exemption schedule, welfare eligibility and affordability parameters, a
> treasury reserve floor, a business-profit tax with its own accounts and posting
> kind, and validated player actions for borrowing, principal repayment, and
> debt-policy refinancing/ceiling changes. It retains requested/paid/shortfall and
> revenue/borrowing/principal/interest as separate measures in monthly and annual
> reports. E2 does not add consumption/excise, property, land, or customs taxes,
> education/health/administration/procurement spending, construction, subsidies, a
> bond market, banking, or monetary policy; those remain dependencies of later stages.
>
> World schema is **18**, simulation **0.18.0**, save format **1**, data version
> **`m3-economy-v3`**, and worker protocol **5**. The schema change adds the extended
> `Country.fiscal` policy, monthly and annual budget decomposition, the
> month-to-date budget memo, and business-tax accounts; canonical hashes and
> known-answer fixtures change intentionally, and incompatible saves are rejected
> under the existing policy. The E2 implementation record is §17A.18; the material
> decisions are recorded in D-073. E1 and M7a records are unchanged.
>
> **v2.8 alignment note.** This revision records **M7a — Annual Accounting** as
> implemented. M7a adds bounded annual finance summaries at each 31 December close,
> year-end treasury/debt/interest balances, partial-year and terminal semantics, and
> controlled audited corrections that never rewrite closed monthly or annual history.
> It does not add E2 fiscal controls or any later economic mechanic.
>
> World schema is **17**, simulation **0.17.0**, save format **1**, data version
> **`m3-economy-v3`**, and worker protocol **4**. The schema change adds
> `FinanceState.annualSummaries`, `FinanceState.corrections`, and
> `FinanceState.nextCorrectionId`; canonical hashes and known-answer fixtures change
> intentionally. Incompatible saves are rejected under the existing policy. The
> annual implementation record is §17B; E1's record remains §17A.17.

> **v2.7 alignment note.** This revision records **E1 — Economic Clarity and Monthly
> Reports** as implemented and updates the E0–E6 status accordingly. It preserves the
> complete E0 design specification, the accepted M0–M7 records, M7a/M8a, and the
> M8–M10 roadmap. E1 adds presentation-only snapshot fields and selectors, a national
> economic overview, evidence-based explanations, a fiscal-policy preview, a bounded
> monthly economic report, and a bounded session-confirmed action history. It adds no
> new tax, spending, construction, industrial, trade, labor-law, monetary, or
> regulation mechanic.
>
> The worker protocol was **3** at E1 because the immutable snapshot contract gained
> required presentation fields (production capacity, need metadata, household cash,
> wage-base/preview data, close balances, monthly labels, and market capacity). That
> was a snapshot-contract change, not an authoritative world-state change: world
> schema remained **16**, simulation **0.16.0**, save format **1**, and data version
> **`m3-economy-v3`**. The E1 implementation record, data limitations, and acceptance
> evidence are in §17A.17.

> **v2.6 alignment note.** This revision supersedes v2.5 as the authoritative
> specification. It adds the **Economic Management Overhaul** as a first-class
> design program and inserts stages **E0–E6** into the build order without
> renumbering or rewriting the accepted **M0–M7** records, the planned intermediate
> stages **M7a/M8a**, or later milestones **M8–M10**. E0 is the design/documentation
> stage recorded by this revision. At v2.6, no E1–E6 gameplay behavior is implemented or
> claimed. The revision:
>
> (a) states the product goal and core diagnose–choose–finance–observe loop in
> §1.4 and §17A;
>
> (b) specifies the seven long-term policy areas (fiscal, public investment,
> industrial/business, trade, labor/social, monetary, and regulation/structural
> reform), each with its mechanical base, accounting and agent effects, timing,
> player-visible consequences, implementation status, and dependencies;
>
> (c) specifies the economic information architecture, causal explanations,
> pre-commitment decision explanations, and bounded monthly economic report;
>
> (d) fixes eleven Economic Management design principles, including one
> player-controlled country, real mechanics, trade-offs, time lags, government
> constraints, explainable outcomes, institutional appropriateness, determinism,
> UI/simulation separation, calibration honesty, and no decorative controls;
>
> (e) defines the E0–E6 roadmap, acceptance criteria, and the combined dependency
> order with the existing M8/M8a/M9/M10 roadmap;
>
> (f) preserves the current implementation truth: M0–M7 remain the accepted or
> implemented baseline, M7 retains its native/device acceptance exception, M7a and
> M8a remain planned, and every unbuilt economic lever is labelled **not
> implemented** or deferred to its E stage.
>
> The overhaul is a design commitment, not a claim that its policy controls,
> construction queue, reports, trade system, or monetary institutions exist. At
> v2.6, the authoritative implementation baseline remained schema **16**, simulation
> **0.16.0**, save format **1**, data version **`m3-economy-v3`**, and the six-screen
> M7 prototype; that revision changed no code, data, save schema, or version
> constant. v2.7 records E1's presentation implementation without changing the
> authoritative world/save baseline.

> **v2.5 alignment note.** This revision supersedes v2.4 as the authoritative
> specification. It records the accepted **M0–M4c** implementation baseline:
> the M1 foundation, the M2/M2.1 population and demographic model, the M3a–M3f
> economy stages, M4a-1 category-aware double-entry accounts and opening
> balances, M4a-2 country/currency identity, monetary arrangements, and
> RUSD-relative valuation, M4b monthly period close and finance summaries, and
> M4c per-country treasury, daily income taxation, and budgeted welfare
> transfers. It does not claim that the complete v1 design, the full economic
> model, or any later milestone is implemented. The revision (a) records the
> M4c fiscal accounts, policy state, posting kinds, daily fiscal phase, welfare
> funding rule, and wealth-input refinement from D-048, (b) states the fiscal
> phase position in the daily pipeline, (c) records the M4c limitations
> (fixed collection efficiency, flat wage-only residence-based tax, a single
> budgeted welfare transfer, and no debt or government services), (d) records
> M4c in the milestone plan, (e) updates the current schema, simulation,
> persistence, and history descriptions to the M4c baseline, and (f) adopts the
> planned intermediate finance stages M5a (profit distributions and
> state-enterprise remittances), M5b (public debt and deficit financing), M7a
> (annual accounting close and controlled corrections), and M8a (inflation, FX
> dynamics, and monetary-policy foundations) in the order `M4c → M5 → M5a → M5b
> → M6 → M7 → M7a → M8 → M8a → M9 → M10`. M5a and M5b were adopted as planned
> stages in this revision and are now implemented and accepted; M7a and M8a remain
> **planned and not implemented**. The adopted stages do not change the
> M4a/M4b/M4c baseline, and the playable vertical slice remains M0–M7. The broader
> vision, historical goals, future-system design, determinism, conservation, and
> scope-control rules remain in force.

> **M5 implementation addendum.** M5 is implemented and accepted. The current
> multi-region/multi-country/multi-market, migration, labor-access, and historical
> data behavior is described in §5.4.4, §6.7–§6.8, §7.4–§7.5, §15.1, §16, and
> §17.2a. **M5a and M5b are implemented and accepted** (§5.4.5/§17.2b, D-056;
> §5.4.6/§17.2c, D-057): world schema is **12** and simulation version **0.12.0**.
> M7a and M8a remain planned and are not implemented. This addendum records
> implementation status; it does not change the M4c baseline or the v2.4/v2.3
> historical documents.

> **M6 implementation addendum.** M6 is implemented and accepted. Deterministic
> country AI v1, the persisted AI schedule/goal state, the own-country/public
> observation boundary, shared player/AI fiscal-policy action validation, the M6
> stress fixture, and the opt-in full-campaign performance report are described in
> §4.2, §12, §16.5, and §17.2d (D-058/D-059). World schema is **13** and simulation
> version **0.13.0**. M6 enables AI in the historical sample and leaves legacy
> fixtures disabled; M8–M10 remain planned and unimplemented (the M7 addendum
> follows). The GDD 4 MiB save
> target is reported against the measured full-campaign save size and is not
> claimed as met.

> **M7 implementation addendum.** The M7 playable shell, versioned worker
> protocol, immutable snapshot bus, six specified screens, player action path,
> and compressed save/load storage are implemented (D-060/D-061). Web export and
> iOS/Android Hermes JS bundles were produced, and the web interaction path was
> exercised in headless mobile emulation. **Native iOS/Android release builds and
> real-device frame rate, memory, battery, cold start, and on-device tick p95 were
> not measured and remain NOT EVALUATED.** M7 is therefore delivered with a
> documented native/device acceptance exception; it is not claimed as a passed
> mobile release. M8 and later milestones remain unstarted.

---

## Document purpose and authority

This document defines the game’s design intent, simulation rules, technical boundaries, implementation order, and acceptance criteria. It is intended to be handed to an agentic coding AI **one milestone at a time**.

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

The agent must not silently resolve a contradiction that changes game behavior. Record the issue and the proposed resolution in `DECISIONS.md`. For minor, reversible details, choose the simplest option consistent with this document and document the assumption.

## Contents

1. Vision and design pillars
2. Core doctrine: no arbitrary gameplay pools
3. Campaign, calendar, and tick semantics
4. Simulation architecture and daily update order
5. Data model and state ownership
6. Population, needs, and social mobility
7. Production, goods, markets, and prices
8. Money, accounting, and public finance
9. Politics and institutions
10. Technology and education
11. Diplomacy, war, and territorial control
12. Country AI
13. Presentation and mobile UX
14. Technical architecture and persistence
15. Historical data and calibration
16. Determinism, invariants, and test strategy
17. Build order and milestone acceptance criteria
    - 17A. Economic Management Overhaul — detailed specification (E0–E6)
    - 17J. Prosperity Program — peacetime economy and demography (P0–P15)
18. Code-agent execution contract
19. Explicit non-goals for v1
20. Decision register and handoff procedure
21. Glossary

---

## 1. Vision and design pillars

### 1.1 Vision

*Fabric of Nations* is a historical grand-strategy simulation in which the player governs a state through the economic, demographic, political, and geopolitical transformations of the twentieth century. The simulation spans industrialization, urbanization, mass education, total war, ideological conflict, decolonization, fiscal expansion, and the rise of the service economy.

The player should feel that a country is not a collection of abstract meters. It is a population with needs, workers with occupations, businesses that produce and sell, governments that collect and spend money, institutions that shape behavior, and physical goods that must be extracted, made, transported, and consumed.

The simulation is deliberately aggregate. It models groups and systems rather than individual people. The target is a plausible and legible century-long causal model, not a perfect reconstruction of every historical detail.

### 1.2 Design pillars

1. **Emergence over arbitrary abstraction.** Important outcomes should follow from population, labor, buildings, resources, money, laws, technology, and external events. A value may be stored as a cache, but its authoritative value must have an explicit causal definition.
2. **The century’s arc is content.** The decline of agricultural employment, the expansion and later relative decline of industrial labor, the growth of services, demographic transition, urbanization, literacy, and government expenditure should arise from model interactions and historical conditions.
3. **Money has counterpart entries.** Income, expenditure, savings, debt, profits, taxes, and monetary issuance must reconcile through an explicit accounting model. A balance may not appear without a source or disappear without a use.
4. **Mobile-first legibility.** The simulation can be deep; the presentation should be clear. Use summaries, charts, alerts, and drill-downs instead of forcing the player to read spreadsheets.
5. **Deterministic and testable simulation.** Given the same initial world and the same player/AI actions, the simulation must produce the same results on the same supported simulation version.
6. **Historical plausibility without railroading.** Historical data and events provide a credible starting point and external shocks, but the systems determine many of the consequences. Not every country must follow the same historical path.

### 1.3 Product definition

- **Genre:** historical grand strategy / macroeconomic simulation.
- **Platforms:** iOS and Android.
- **Primary interaction:** pause, inspect, issue policy and construction orders, then advance time.
- **Campaign:** 1900 to the start of 2000; the terminal state is the boundary at 2000-01-01.
- **World representation:** a stylized political map of approximately 500 regions, initially using curated region boundaries rather than a tile grid.
- **Population representation:** aggregate population blocks; never simulate individual citizens.
- **Simulation cadence:** one civil day per tick, with subsystem work staggered where safe.

### 1.4 Economic management design objective

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

This is the design anchor for the Economic Management Overhaul. The complete policy
framework, interface requirements, principles, acceptance criteria, and E0–E6
roadmap are in **§17A**; the main roadmap cross-references them in §17.3/§17.5.
Existing implemented fiscal, debt, market, labor, and app behavior remains as
specified in §§5–8, 12–14; the overhaul does not retroactively claim unimplemented
systems.

---

## 2. Core doctrine: no arbitrary gameplay pools

### 2.1 Binding rule

The simulation must not introduce an arbitrary, spendable point pool merely to gate actions or create gameplay friction. A quantity traditionally represented by “mana” must instead be derived from people, institutions, resources, goods, money, time, laws, or other explicit state.

This does **not** prohibit every scalar, counter, index, or stored value. Money balances, inventory, debt principal, employment, technology project progress, building capacity, institutional quality, and other quantities are valid when their sources, uses, and update rules are defined.

### 2.2 Required replacements

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

### 2.3 Enforcement

- Do not create generic spendable resources such as `researchPoints`, `politicalPowerPoints`, or `diplomaticPoints`.
- Do not ban legitimate terms such as `capacity`, `power`, or `influence` when they describe a concrete or derived quantity. A warehouse capacity and a derived interest-group influence score are valid.
- A stored derived quantity must be recomputable from authoritative state. If stored as a cache, it must be safe to discard and rebuild.
- Any accumulated quantity must identify what creates it, what consumes or changes it, its units, and its boundary conditions.
- Fixed per-tick progress is permitted only when it represents a defined causal process. For example, academic work can advance a specific technology project; technology progress cannot appear merely because a day passed.
- Implement automated checks for known forbidden pools and add subsystem-specific causal tests. A grep rule may warn about suspicious names, but must not be the sole enforcement mechanism.

---

## 3. Campaign, calendar, and tick semantics

### 3.1 Calendar convention

Use integer day indices and an explicit Gregorian-calendar implementation. The simulation package must not depend on `Date`, local time zones, daylight-saving time, or wall-clock APIs.

- `dayIndex = 0` corresponds to 1900-01-01.
- The campaign processes the civil days from 1900-01-01 through 1999-12-31.
- There are **36,524 daily ticks** in this interval, including Gregorian leap days from 1904 through 1996.
- After those ticks, `dayIndex = 36,524` is the terminal boundary corresponding to 2000-01-01. No additional campaign day is processed.
- The state’s `dayIndex` always means the **next civil day to process**, except when it reaches the terminal boundary, at which point the campaign is complete.

The calendar implementation must be covered by tests for year boundaries, month lengths, leap years, 1900-02-28, 1900-03-01, 1996-02-29, 1999-12-31, and the terminal boundary. Gregorian rule: a year divisible by 100 is not a leap year unless it is also divisible by 400.

### 3.2 Speed controls

Supported player speeds:

- Pause
- 1 simulated day per second
- 3 simulated days per second
- 10 simulated days per second
- 30 simulated days per second

At 30 days per second, a complete 36,524-tick campaign takes approximately 20.3 minutes of uninterrupted simulation time, excluding UI and device throttling. This is a throughput target, not a requirement to run continuously while the app is backgrounded.

Default background behavior: pause simulation when the app enters the background, save safely, and resume when the player returns. Any optional offline catch-up mode must be explicitly designed, bounded, deterministic, and tested separately.

### 3.3 Simulation and UI clocks

- Simulation time is exclusively the integer `dayIndex` and its deterministic calendar mapping.
- UI animation and batching may use a wall clock outside `packages/sim`.
- The simulation must not depend on real elapsed time, device time, frame rate, or task scheduling.
- Speed controls determine how quickly the driver calls `tick`; they must not alter the result of a given number of ticks.

### 3.4 Evaluation cadence

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

---

## 4. Simulation architecture and daily update order

### 4.1 Pure simulation boundary

`packages/sim` is a deterministic TypeScript simulation library. It must not import React Native, Expo, DOM APIs, UI libraries, platform storage, network clients, or device APIs.

The simulation receives a world state and a set of explicit player/AI actions. It advances one civil day using a defined update pipeline. It must not read external state or silently generate player input.

Use a single authoritative world state. UI snapshots, chart history, and cached summaries are derived representations and must not become alternative sources of truth.

### 4.2 Mandatory daily pipeline

The economic day follows one documented update order. The current M3f/M4b order is
binding for economic worlds:

1. **Validate boundary and day.** If the campaign has reached the terminal
   boundary, do not process another day. Validate the world and explicit context.
   *(Current implementation.)*
2. **Apply scheduled events and effective policy changes.** An event must apply at
   most once unless explicitly defined as recurring. *(Current M8: scripted events
   and effective law transitions run at the start of the day, followed by the
   monthly institution/interest-group/election/crisis check. A law transition applies
   forward from its effective day and never rewrites a closed period. Country AI
   still evaluates on its staggered seven-day schedule and applies only validated
   fiscal-policy changes through the same action validator a player uses. AI law
   proposals remain unimplemented.)*
3. **Apply annual single-year ageing when required.** Advance every person exactly
   one year, oldest-to-youngest, without creating or destroying population. Age 79
   enters the open-ended 80+ slot; the 80+ slot does not age out. Skip ageing on
   the scenario's `startDayIndex`. *(Current M2.1/M3f implementation.)*
4. **Apply daily demographic flows.** Process births and deaths using
   deterministic fractional-person accumulators; record the cause of each
   aggregate flow. *(Current M2.1/M3f implementation.)*
5. **Refresh dirty labor supply and employment assignments.** Run the existing
   monthly/dirty employment refresh. If daily demographic change makes existing
   assignments invalid before the next monthly refresh, mark employment dirty and
   repair immediately. *(Current M3b/M3f implementation.)* **v2.19 (D-126, P1b):** the
   immediate repair trims only the over-assigned blocks; a full reassignment runs only
   when the trim cannot make the state valid.
5a. **Apply monthly migration when due.** On the first civil day of a month (not
   the scenario start day), move eligible people between existing same-profession
   blocks in different regions when the documented vacancy/wealth pressure is
   positive, respecting domestic/open-border access and the destination inflow
   cap. Mark employment dirty and refresh it again in the same day after any flow.
   *(Current M5 implementation, §5.4.4, D-052.)*
6. **Calculate market opening state.** Record opening stock, storage capacity,
   prices, and the funded cash available to buyers for each market independently.
   *(Current M3d/M3f implementation, extended to multiple markets by M5.)*
7. **Post production-input demand.** Buildings calculate feasible input needs from
   current capacity, staffing, condition, and their own market's opening
   inventory. The day first attempts full desired production demand, allowing
   M3e's atomic same-batch sales receipts to fund input purchases. If that attempt
   would overdraw a buyer, the staged day is restored and production demand is
   retried with each building's input cost capped by opening operating cash.
   *(Current M3c/M3d/M3e/M3f implementation; market-scoped by M5.)* **v2.19 (D-125, P1b):**
   the day now runs the cash-capped attempt once; same-day receipts no longer fund
   inputs beyond opening cash, and market postings are aggregated per kind and good.
8. **Produce goods.** Execute production using inputs actually allocated. New
   output becomes available to the market for final demand on the same day, but
   cannot serve as an input to another production stage until the next tick. This
   avoids order-dependent same-day production chains. *(Current M3c/M3d
   implementation; market-scoped by M5.)*
9. **Post final demand.** Calculate household demand according to opening cash,
   needs tiers, prices, and the funded-demand rule. *(Current M3f implementation
   for households. Government, construction, and export demand are future systems
   and are absent.)*
10. **Clear each market deterministically.** Allocate goods using priority tiers,
    with proportional allocation within a tier. This step also applies final
    storage overflow and the bounded M3d price adjustment based on physical market
    imbalance. Final overflow losses do not feed back into the same day's price.
    *(Current M3d implementation.)*
11. **Settle real transactions.** Apply market purchases, sales receipts, wages,
    and building upkeep through the accounting interface, using the transaction
    quantities and prices established by market clearing. *(Current M3e
    implementation for those flows. Dividends/distribution, government
    procurement, interest, and debt are current only in the documented M5a/M5b
    subsets; M5a profit allocation runs after the month-end close, and M5b debt
    service runs between the fiscal phase and the close.)*
12. **Accrue finance and settle due contracts.** Accrue daily income tax on
    wages actually received and pay the country's daily budgeted welfare transfer.
    Then run the M5b debt phase: accrue one day of interest on every active debt
    contract; on a civil month-end, finance the accrued fiscal deficit up to the
    designated creditor's cash and outstanding-principal ceiling, pay accrued
    coupons, process maturities/refinancing, and apply explicit arrears/default
    after the grace period. The M4b close then records the period result.
    *(Current M4c fiscal implementation plus current M5b debt implementation,
    D-048/D-057. No banks, monetary operations, or market-priced bonds exist.)*
13. **Update cadence-due indicators.** Apply the monthly wealth update when the
    civil month ends, using the convention in §6.5. *(Current M3f monthly wealth
    with the M4c income-tax/welfare input refinement. M8 updates regional unrest
    immediately after needs/militancy; its tax/construction effects are read on the
    next civil day. Other daily/weekly/monthly macroeconomic indicators are future
    systems.)*
14. **Record history and diagnostics.** Update annual samples at the specified
    boundary, invariant counters, and compact audit summaries. On an economic
    world's last civil day of the month, close the monthly finance period after
    that day's postings, needs/militancy, and month-end wealth update, and record
    the immutable monthly summary before `dayIndex` advances (§5.4.2, D-047).
    When `World.profitDistribution` is enabled, immediately after the close,
    reclassify each building's frozen period result to retained profit and apply
    the documented private distribution/state remittance, capped by operating
    cash, before `dayIndex` advances (§5.4.5, D-056). The M5b debt phase runs
    before this close, so debt financing, coupons, and maturities are reflected in
    the period summary without becoming revenue or expense flows (§5.4.6, D-057).
    *(Invariant and diagnostic counters, the M4b monthly finance close, the M4c
    fiscal flows, M5a profit allocation, and M7a annual summaries/corrections exist;
    broader annual history and historical-event recording are future systems.)*
15. **Advance `dayIndex`.** Move to the next civil day or the terminal boundary.
    *(Current implementation. A completed close is publishable only after this
    step: see the staged-versus-published rule in §5.4.2.)*

**Price-update placement (approved resolution).** GDD v2.1 listed price updates
after settlement. The accepted M3d/M3e/M3f design instead treats bounded price
adjustment as part of **market clearing**, before monetary settlement. This is an
approved design clarification recorded as D-043, not a silent prose change.
Market clearing establishes transaction prices from opening prices and physical
imbalance; M3e then settles at those established prices and does not feed
financial settlement back into the current day's price. Moving the bounded price
calculation after settlement would produce the same current-day pending prices in
M3f, but would weaken the rule that physical market clearing determines prices and
would create an unnecessary future coupling between financial flows and current
prices. Future financial systems must not retroactively change established
transaction prices.

> **Superseded direction (v2.19, D-116, assigned to P1).** Whole-day staged
> cloning is replaced by per-phase precondition validation, daily cheap global
> invariants, month-end full validation, and checkpoint rollback with
> deterministic replay to the start of a failed day (§17J.4). No partial day is
> ever accepted. **P1a implemented this for the worker host** (`TickContext.integrity
> = "phase"` through `runTicksWithRollback`; D-116 implementation record). The
> paragraph below remains the default `tick` behaviour for direct callers and tests.

**Whole-day atomicity.** For an economic world, the complete day is staged on a
structural deep clone of the authoritative world. Population, employment,
inventory, prices, finance, postings, country/currency/valuation state, country
fiscal state, country AI policy/goal state, fiscal postings, monthly finance
summaries, needs indicators, wealth, and calendar state mutate only the staged
world. The staged world is published to the caller's world object only after every
phase and final validation succeeds. A failure leaves the original world, its hash,
and its serialized representation unchanged. The M4b period close is itself an
additional atomic stage: it copies the finance state, applies the closing entries
and the summary on that copy, validates the result, and only then replaces
`world.finance` (§5.4.2). The M4c fiscal phase stages on an isolated finance clone,
validates the complete staged world and treasury reconciliation, and only then
replaces `world.finance`; it also consumes the transient settlement result so
duplicate or stale execution is rejected. The M6 AI phase validates every proposed
action before applying it and validates the candidate world before replacing a
country's fiscal policy; a rejected AI proposal is counted and skipped. The
M2-only path retains its population-only behavior and does not use the M3f
economic staging path.

**M2-only and economic-world distinction.** A world with no buildings or markets
uses the M2-only path: ageing, daily demography, the M2 needs fixture, daily
militancy, optional month-end wealth, and one calendar advance. A world with
buildings or markets requires explicit economy and population definitions and uses
the M3f economic path above. Economic worlds do not use the M2 needs fixture.

**M4a-2 current scope.** Country, currency, and valuation state is
scenario-provided authoritative state and is copied by the structural clone, but
M4a-2 has no daily monetary, FX, inflation, issuance, or regime-transition phase.
`CurrencyValuation` is not updated by the daily economic pipeline; it is a
valuation input, not a dynamic exchange-rate process.

**M4b current scope.** M4b adds the month-end finance close and its summary
(§5.4.2). It adds no daily monetary phase, no interest or debt accrual, no
issuance, and no FX process; the close remains cash-neutral and moves no
designated cash.

**M4c current scope.** M4c adds the fiscal part of step 12 and the fiscal
accounts, policy state, posting kinds, structural posting validation, government
period-total derivation, phase-qualified transient cash fields, and wealth inputs
described in §5.4.3 and §8. It adds no government procurement or service demand,
no state employment, no subsidies or debt service, no
corporate/consumption/land/tariff taxation, no debt or deficit financing, and no
monetary, FX, or inflation behavior. Fiscal policy is scenario-initialised runtime
state; nothing in M4c mutates it.

This pipeline may be revised only through a documented design decision and
regression tests. All markets must use a stable order or an order-independent
clearing method, and all stochastic effects must be independent of the order in
which unrelated entities are processed.

### 4.3 Scarcity and allocation

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

**Current M3 status:** the implemented tiers are household subsistence (1),
critical production inputs (2), household basic needs (3), remaining production
inputs (5), and household comfort/luxury (6). Government demand (4), construction
and discretionary demand (7), exports, tariffs, and multi-market allocation are
future systems. M3d uses seller-attributed lots and deterministic proportional
allocation within a tier. Same-day sales receipts may fund production-input
purchases through M3e's atomic batch; a conservative opening-cash fallback is used
only if the full-demand attempt would overdraw a buyer.

### 4.4 Month and year boundaries

- Use actual calendar months, not a fixed 30-day month.
- Annual demographic transitions and annual history samples occur at documented civil-calendar boundaries. January 1 ageing is skipped on a scenario's initial January 1.
- Monthly systems should have explicit due checks, not independent timers. **Current M3f/M4b/M4c:** monthly wealth runs on the last civil day of the month after needs and daily militancy, and the M4b finance period close runs immediately after that month-end wealth update, before the day advances (§4.2 step 14, §5.4.2). Income tax and the welfare transfer are daily fiscal flows inside step 12, not month-end timers. Other monthly finance, political, and history systems are future work.
- Accruals remain daily even when payment settles monthly. A monthly settlement must not duplicate or omit accruals. **Current M4c:** income tax accrues and is withheld daily; welfare accrues and is paid daily; the monthly close recognizes the period result but does not re-run either flow. *(M5b now implements debt and interest accrual; annual close remains planned in M7a.)*

---

## 5. Data model and state ownership

### 5.1 General rules

- Static definition data is immutable and versioned; it is loaded from validated data files.
- Runtime state is serializable and versioned.
- Dense numeric IDs are stable within a save. Do not rely on array order remaining stable after migration or content changes.
- Authoritative state is stored once. Derived statistics are caches that can be recalculated.
- Every numeric field has documented units, valid ranges, ownership, and update cadence.
- Validate input data before a campaign starts. Invalid data must produce a useful error instead of silently defaulting to zero.
- Do not store `NaN`, infinity, or undefined values in serializable state.

### 5.2 Core primitive types

```ts
type DayIndex = number;       // 0..36_524; terminal boundary is 36_524
type Id = number;             // stable dense numeric ID within a world
type MoneyRUSD = number;      // nominal RUSD unit of measurement (not a national currency)
type Rate = number;          // normalized ratio, normally 0..1
type Count = number;          // non-negative integer persons, jobs, or items
type IndexValue = number;     // documented derived index; range specified per field
```

`RUSD` — **Reference US Dollars** — is the simulation's fixed **unit of
measurement and accounting denomination**. It is a neutral reference unit used
to compare and calculate economic values across national monetary systems. It is
not a currency issued by any country, not legal tender, not an adoptable
national currency, and not a replacement for the real-world United States
dollar or any other national currency. One RUSD is not defined as one real US
dollar, and no fixed USD/RUSD exchange rate is implied.

Its definition is fixed, but its purchasing power is not fixed: nominal RUSD
values are distinct from any future real/inflation-adjusted values derived from
a documented price index or reference period. M4a-1 accounting balances are
nominal RUSD. RUSD is not registered, issued, or adopted as a currency in M4a-2,
and a fixed RUSD measurement unit does not imply that other currencies are
pegged to RUSD. Future currency regimes and FX indicators may influence
cross-market prices, reserves, trade, and capital flows, but M4a-2 does not
implement dynamic FX, inflation, monetary policy, or native-currency accounting.
This is an explicit scope boundary, not a license to create unexplained money.

### 5.3 Static definitions

```ts
interface GoodDef {
  id: Id;
  key: string;
  name: string;
  category: 'food' | 'raw' | 'industrial' | 'luxury' | 'service';
  basePrice1900RUSD: MoneyRUSD;
  transportCostPerUnit: MoneyRUSD;
  priceElasticity: number;       // calibrated parameter; documented range
  spoilageRateAnnual: Rate;      // 0 for non-perishable goods
  unitLabel: string;
}

interface ProfessionDef {
  id: Id;
  key: string;
  name: string;
  stratum: 'lower' | 'middle' | 'upper';
  participationRate: Rate;       // applied to the eligible working-age population
  qualificationLiteracy: Rate;
  qualificationWealthLevel: number; // 0..99
  baseWage1900RUSDPerYear: MoneyRUSD;
  trainingCostRUSD: MoneyRUSD;
  laborProductivityModifier: number;
}

interface BuildingDef {
  id: Id;
  key: string;
  name: string;
  inputs: { goodId: Id; quantityPerFullOutputDay: number }[];
  outputs: { goodId: Id; quantityPerFullOutputDay: number }[];
  jobs: { professionId: Id; workersAtLevelOne: number }[];
  constructionCostRUSD: MoneyRUSD;
  dailyUpkeepRUSDAtLevelOne: MoneyRUSD;
  storageCapacityByGood?: { goodId: Id; quantity: number }[];
  resourceRequirements?: { goodId: Id; quantityPerDayAtFullOutput: number }[];
  requiredTechnologyId: Id | null;
  ownershipAllowed: ('private' | 'state')[];
  isEssentialInfrastructure: boolean;
}

interface TechnologyDef {
  id: Id;
  key: string;
  name: string;
  era: 1 | 2 | 3 | 4 | 5 | 6;
  prerequisiteIds: Id[];
  researchWorkRequired: number;
  minimumLiteracy: Rate;
  effects: TechnologyEffect[];
}

interface LawDef {
  id: Id;
  key: string;
  slot: LawSlot;
  effects: LawEffect[];
  enactmentDays: number;
  prerequisiteLawIds: Id[];
  eligibleRegimes: string[];
}
```

All effect types such as `TechnologyEffect` and `LawEffect` must be tagged, validated data structures. Do not execute arbitrary code or `eval` from data files.

### 5.4 Runtime state

```ts
interface World {
  schemaVersion: number;
  simVersion: string;
  dataVersion: string;
  dayIndex: DayIndex;                 // next civil day to process
  startDayIndex: DayIndex;            // initial represented day of this scenario
  seed: number;
  scenarioId: string;
  countries: Country[];                // M4a-2; may be empty in earlier worlds
  currencies: Currency[];              // M4a-2; may be empty in earlier worlds
  currencyValuations: CurrencyValuation[]; // M4a-2; one per registered currency
  regions: Region[];
  popBlocks: PopBlock[];
  buildings: BuildingInstance[];       // future systems may be empty
  employment: EmploymentAssignment[];  // future systems may be empty
  markets: Market[];                   // future systems may be empty
  finance: FinanceState;
  treaties: Treaty[];                  // empty until diplomacy milestone
  armies: Army[];                      // empty until war milestone
  eventQueue: ScheduledEvent[];
  history: HistoryBuffers;
  diagnostics: SimulationDiagnostics;
}

interface PopBlock {
  id: Id;
  regionId: Id;
  professionId: Id;                   // household’s principal socioeconomic occupation
  maleByAge: Uint32Array;             // 81 slots: ages 0..79, index 80 = 80+
  femaleByAge: Uint32Array;           // 81 slots: ages 0..79, index 80 = 80+
  literacy: Rate;
  wealthLevel: number;                // 0..99; smoothed standard-of-living index
  financialAccountId: Id;
  militancy: Rate;
  unmetSubsistenceDays: number;
  unmetBasicDays: number;
  comfortFulfilledDays: number;
  fractionalBirthRemainder: number;   // total births
  fractionalMaleBirthRemainder: number; // male/female birth split
  fractionalDeathRemainder: number;
}

interface EmploymentAssignment {
  id: Id;
  popBlockId: Id;
  buildingInstanceId: Id;
  professionId: Id;
  workers: Count;
}

interface BuildingInstance {
  id: Id;
  definitionId: Id;
  regionId: Id;
  level: number;
  condition: Rate;
  ownerKind: 'private' | 'state';
  ownerCountryId: Id;
  builtOnDay: DayIndex;
  operational: boolean;
  operatingCashAccountId: Id;
  jobsFilledByProfession: Record<Id, Count>;
}

interface Region {
  id: Id;
  key: string;
  name: string;
  // Country ownership is authoritative in Country.regionIds; no Region.countryId.
  marketId: Id;
  terrainId: Id;
  areaKm2: number;
  urbanization: Rate;
  infrastructure: Rate;
  resourceCapsPerDay: number[];       // keyed by good ID, with explicit units
  popBlockIds: Id[];
  buildingInstanceIds: Id[];
  unrest: Rate;
  occupation: { byCountryId: Id; sinceDay: DayIndex } | null;
}

interface Market {
  id: Id;
  regionIds: Id[];
  priceRUSD: number[];
  openingStock: number[];
  closingStock: number[];
  storageCapacity: number[];
  productionToday: number[];
  desiredDemandToday: number[];
  fundedDemandToday: number[];
  fulfilledDemandToday: number[];
  unmetDemandToday: number[];
}

interface Country {
  // Current M4a-2/M4c fields:
  id: Id;
  tag: string;
  name: string;
  monetary: MonetaryArrangement;      // sole domestic monetary arrangement
  regionIds: Id[];                     // sole authoritative country-to-region mapping
  treasuryAccountId: Id;               // current M4c: own treasury-cash account
  fiscal: FiscalPolicy;                // M4c + E2 provisional tax/spending/reserve policy
  debt: DebtPolicy;                    // M5b provisional public-debt policy
  // Future country systems (not present in M4c):
  sovereign: boolean;
  overlordId: Id | null;
  capitalRegionId: Id;
  laws: Record<LawSlot, Id>;
  institutions: InstitutionState;
  technology: TechnologyState;
  interestGroups: InterestGroupState[];
  ai: AIState;
  statsCache: CountryStats;
}

interface FiscalPolicy {
  incomeTaxRate: Rate;                       // flat rate on taxable wages, 0..1
  incomeTaxAllowanceRUSDPerYear: MoneyRUSD;  // E2 per-block annual exemption, >= 0
  welfareBudgetRUSDPerYear: MoneyRUSD;       // requested annual nominal target, >= 0
  welfareMaxWealthLevel: number;             // E2 inclusive eligibility ceiling, 0..99
  businessProfitTaxRate: Rate;               // E2 rate on positive monthly profit, 0..1
  reserveTargetRUSD: MoneyRUSD;              // E2 treasury liquidity floor, >= 0
}

interface Currency {
  id: Id;
  key: string;                         // stable lower-case; `rusd` reserved
  name: string;
  issuer: CurrencyIssuer;
}

type CurrencyIssuer =
  | { kind: 'country'; countryId: Id }
  | { kind: 'foreign'; issuerKey: string }
  | { kind: 'union'; unionKey: string }; // rejected in M4a-2

type MonetaryArrangement =
  | { kind: 'own'; currencyId: Id }
  | { kind: 'adopted'; currencyId: Id }
  | { kind: 'shared'; currencyId: Id; unionKey: string }; // rejected in M4a-2

type RusdPerCurrencyUnit = number;     // RUSD per one currency unit; branded in code

type CurrencyValuation =
  | {
      currencyId: Id;
      status: 'specified';
      rusdPerUnit: RusdPerCurrencyUnit;
      setOnDay: DayIndex;              // equals the world start day in M4a-2
      source: 'scenario';
    }
  | { currencyId: Id; status: 'unavailable' };

// Historical: the v2.2 `CurrencyState` target (`regime`, `fxToUSD`,
// `inflationIndex`, `goldReservesOunces`, `centralBankAccountId`,
// `moneySupplyRUSD`) is superseded by the M4a-2 model above. Those fields are
// not current authoritative state; they are retained only in the historical
// v2.2 document. Regimes, inflation, gold convertibility, central banking, and
// monetary aggregates remain future systems described in §8.6.

interface CountryStats {
  population: number;
  workingAgePopulation: number;
  employment: number;
  unemployment: number;
  nominalGDP12M: MoneyRUSD;
  exports12M: MoneyRUSD;
  imports12M: MoneyRUSD;
  governmentRevenue12M: MoneyRUSD;
  governmentSpending12M: MoneyRUSD;
  debt: MoneyRUSD;
  debtToGDP: number;
  literacy: Rate;
  urbanization: Rate;
  serviceEmploymentShare: Rate;
  agriculturalEmploymentShare: Rate;
  lastUpdatedDay: DayIndex;
}
```

The above interfaces establish the target structure, not permission to duplicate
state. If a field is entirely derivable, document why it is cached and how it is
rebuilt. A cache must never silently become authoritative. In M2.1,
`maleByAge`/`femaleByAge` are authoritative and the 17 five-year bands are derived
on demand. Scenario JSON may provide 17 five-year group totals because historical
sources commonly publish that resolution; creation expands them uniformly to
single years and places 80+ at index 80. That within-band expansion is a
documented provisional assumption, not an additional source observation.

**Current schema-10 baseline (M0–M5).** The code block above is the target
contract, not a claim that every field exists. The accepted schema-10 `World`
contains `schemaVersion`, `simVersion`, `dataVersion`, `scenarioId`, `dayIndex`,
`startDayIndex`, `seed`, `regions`, `countries`, `currencies`,
`currencyValuations`, `popBlocks`, `buildings`, `employment`,
`employmentDirty`, `markets`, `finance`, and `diagnostics`. It does not yet
contain `treaties`, `armies`, `eventQueue`, or `history`. Current `Country`
contains `id`, `tag`, `name`, `monetary`, `regionIds`, `treasuryAccountId`,
`fiscal`, and the M5 `immigrationOpen` policy; `Region` has no `countryId`, and
ownership is authoritative in `Country.regionIds`. Current `BuildingInstance`
uses `ownerAccountId` and `operatingCashAccountId` rather than the target
`ownerCountryId`/`jobsFilledByProfession`; employment lives in the explicit
assignment collection. Current `Market` stores authoritative `stockLots` plus
`regionIds` and `priceRUSD`, not the target aggregate flow arrays. M4a-1
`FinancialAccount` uses `category`/`subtype` with normal-side `balanceRUSD`, and
M4c adds the `country` owner kind and the fiscal subtypes (§5.4.3);
`FinanceState` contains `accounts`, `postings`, `nextPostingId`, `nextAccountId`,
`opening`, `periodSummaries`, `annualSummaries`, `corrections`,
`nextCorrectionId`, and `closedThroughDay`. The M4b monthly summaries, M7a annual
summaries/controlled corrections, and close boundary are current authoritative state
(§5.4.2, §17B); monetary aggregates and a `World.history` collection are future.
M4a-2 adds no native-currency balances. M5 makes multi-region worlds,
multiple markets, and migration current behavior (§5.4.4); it adds no migration
flow history, external-trade account, or new monetary state. These are
implementation boundaries, not permission to omit conservation or serialization.

**Current schema-21 M8 extension.** M8 adds `Country.regime`, `Country.laws`,
`Country.lawTransitions`, `Country.interestGroups`, and `Country.institutions`;
`Region.unrest` and `Region.infrastructure`; and `World.politics`
(`enabled`, bounded `eventQueue`, bounded `eventLog`, allocators). The target
`World.eventQueue` field remains future-compatible; M8's queue lives in
`World.politics` so that an opted-in world's whole political subsystem is one
explicit state block. A world whose `EconomyDefinitions.politics` is absent has
`World.politics.enabled = false` and no M8 behavior. Country law ids are 0 for a
slot with no implemented law. The authoritative definitions (regimes, laws,
interest groups, scripted events, administration profession keys) live in
`packages/data/data/politics.json` and are validated at load.

### 5.4.1 M4a-2 country, currency, and valuation model (current)

M4a-2 makes `World.countries`, `World.currencies`, and
`World.currencyValuations` authoritative. `Country.monetary` is the sole domestic
monetary arrangement; there is no top-level `Country.currencyId`.
M4c extends the scenario country input to `CountryInitialDef`, which adds
`treasuryAccountId`, `initialTreasuryCashRUSD`, and `fiscal`; construction builds
the runtime `Country` from it and creates the fiscal accounts (§5.4.3).
`Country.regionIds` is the sole country-to-region ownership mapping; there is no
`Region.countryId`.

Issuance is independent of domestic use:

- `own` selects a currency issued by that country.
- `adopted` selects a currency issued by another simulated country or an
  explicitly represented foreign issuer. Adoption does not change issuer
  identity, and an adopter does not become the issuer of the adopted currency.
- A country may issue one currency and adopt a different currency for domestic
  use. Its issued currency may be adopted by another country or remain unused.
- Each simulated country may issue at most one currency under the current scope
  restriction (D-045). This is an implementation restriction, not a permanent
  design commitment.
- A foreign-issued currency must be adopted by at least one country under the
  current M4a-2 rule (D-045). A simulated-issued currency may be unused.
- Shared-currency arrangements and union issuers are rejected in M4a-2. Their
  representations are reserved for future design, not implemented behavior.

Every registered currency has exactly one issuer and exactly one valuation
record. A `CurrencyValuation` is either `specified` or explicitly `unavailable`.
A specified record carries `rusdPerUnit` (the RUSD value of **one** unit of the
currency), `setOnDay` (equal to the world start day in M4a-2), and
`source: 'scenario'`. Missing or unavailable valuations never default to parity or
another currency's value. RUSD is not a currency-registry entry or a valid
arrangement target, and currency keys cannot represent RUSD through casing
variations.

Cross rates are derived, never stored:

`crossRate(from, to) = from.rusdPerUnit / to.rusdPerUnit`

The result is units of `to` per one unit of `from`. `rusdPerUnit` is a valuation
input, not by itself a peg. M4a-2 does not implement dynamic FX, floating or
managed exchange rates, inflation, monetary policy, central-bank operations, gold
convertibility, legal-tender enforcement, issuance operations, native-currency
balances, or currency conversion during market settlement. Exchange-rate dynamics,
inflation measurement, and monetary-policy foundations are planned in M8a
(§17.3); the other listed items remain future or unassigned. None is current
behavior.

### 5.4.2 M4b monthly finance close and period summaries (current)

M4b adds a monthly period close for economic worlds and immutable monthly finance
summaries. It does not add taxes, government finance, debt, interest, banks,
central banking, monetary issuance, native-currency balances, FX conversion,
inflation, monetary regimes, currency unions, annual close, reopen/reversal, or
UI. The approved design is D-047; the implementation notes in that decision record
the same rules.

**Timing.** An economic world closes its books on the last civil day of each
Gregorian month, after that day's postings (market settlement, wages, upkeep),
needs/militancy update, and month-end wealth update, and before `dayIndex`
advances. This is the M4b part of §4.2 step 14. The M2-only population path does
not close and creates no summaries. The terminal `2000-01-01` boundary is never
closed; the last possible period ends `1999-12-31`.

**Period boundaries.** Period bounds are inclusive. The first period starts at
`World.startDayIndex` and may be partial. Every period end is a civil month-end,
and each later period starts the day after the previous end. Once a period has
closed, the only legal next end is the first month-end after
`closedThroughDay`; a missed month-end is rejected instead of merged into a
longer period. Duplicate and out-of-order closes are rejected.

**Partial first period (documented limitation).** Published-state validation cannot
independently prove which calendar days a caller actually processed before the
first close. The accepted convention is therefore that the first close may occur
at any civil month-end on or after `startDayIndex`; its summary starts at
`startDayIndex` and describes the balances that exist. Gap detection applies only
between *closed* periods. The same limitation applies to later periods: validation
checks contiguity between recorded summaries but cannot prove that every month-end
between the last summary and `dayIndex` was processed. This convention must not be
read as a guarantee that every month-end since `startDayIndex` was processed or
that the first period's calendar span was fully simulated.

**Summary content.** A `FinancePeriodSummary` contains `periodStartDay`,
`periodEndDay`, `accountTotals`, and `flowTotalsByKind`. It is captured
immediately before the closing entries and is immutable history. `accountTotals`
is the pre-close trial balance: every nonzero account, including opening
balance-sheet balances and the period's revenue/expense balances. Only nonzero
accounts are listed, and account ids are canonical decimal keys.
`flowTotalsByKind` always carries the four current gross flows and nothing else:

| Flow kind | Derived from the pre-close balance of |
|---|---|
| `goods-purchase` | `consumption-expense` accounts |
| `input-purchase` | `input-expense` accounts |
| `wages` | `wage-expense` accounts |
| `upkeep` | `upkeep-expense` accounts |

`period-close` is not a flow kind. No separate flow accumulator exists: the
derivation is valid because revenue/expense opening balances are rejected, the
semantic posting matrix below is enforced, expense balances are nonnegative, and
every close zeroes them exactly. Given those invariants, each expense balance is
the gross activity of exactly one period. Opening balance-sheet balances are
represented in `accountTotals` but are never treated as period flows. The recorded
flows are gross activity, not profit, taxable income, or a distribution.

**Opening balances.** Opening balances are pre-existing balance-sheet state, not
period activity. `applyOpeningBalances` rejects nonzero opening entries for
`revenue` and `expense` accounts; those accounts start at zero. Opening entries
remain allowed for asset, liability, and equity accounts.

**Semantic posting matrix.** For every journal line, revenue and expense accounts
are governed by a central matrix enforced for individual postings, batched
postings, and persisted-posting validation:

- `goods-purchase`: debit `consumption-expense`, credit `sales-revenue`;
- `input-purchase`: debit `input-expense`, credit `sales-revenue`;
- `wages`: debit `wage-expense`, credit `wage-income`;
- `upkeep`: debit `upkeep-expense`, credit `system-income`.

Cash and equity lines remain governed by the existing account and cash
invariants. `profit-distribution` and `owner-capital-injection` may not post to
revenue or expense accounts.

**Internal `period-close` operation.** Closing entries use a registered internal
transaction kind, `period-close`. The public `postJournalEntry` and
`postJournalBatch` APIs reject it at both the type and runtime boundaries, so a
public caller cannot construct arbitrary closing entries. Persisted
`period-close` postings are still structurally validated: no designated-cash
lines, revenue debits only, expense credits only, revenue/expense/equity accounts
only, exactly one equity net line whose side and amount equal
`revenue - expense`, and balanced debits/credits. An exact zero net needs no
equity line. The internal posting helper is not publicly exported.

**Closing entries.** For each owner with nonzero revenue or expense balances, the
close debits every revenue account, credits every expense account, and posts the
net `revenue - expense` to that owner's existing `owner-equity` account. A
positive net credits equity; a negative net debits it; equity may therefore become
signed and may be negative. A zero net needs no equity line. One entry is created
per owner, in deterministic owner order (pop blocks, then buildings, then
countries, then the system owner; M4c inserted countries after buildings) with
account-id order inside the entry, and all entries are applied as one atomic
batch. Closing entries are cash-neutral and preserve the accounting
identity `assets + expenses = liabilities + equity + revenues`; they zero revenue
and expense balances exactly. They never create a distribution, tax, debt, or
monetary issuance.

**Owner-equity requirement.** Every owner with any revenue or expense account must
have exactly one `owner-equity` account, and the close fails before mutating
published state if that account is missing. The rule covers the system owner
independently of whether a system-reserve cash account exists. The close never
creates an equity account implicitly and never skips an owner's balances.

**Atomicity and staging.** The close stages the entire finance state on a deep
copy, creates the closing entries and summary on the copy, advances the copy's
`closedThroughDay`, validates the complete staged finance state (accounts,
postings, owner-equity invariant, accounting identity, summaries), and only then
replaces `world.finance`. Any failure leaves the original accounts, balances,
postings, summaries, and close boundary unchanged.

**Staged versus published state.** A staged close may temporarily have
`closedThroughDay === world.dayIndex`. A published or serializable world requires
`closedThroughDay === null || closedThroughDay < world.dayIndex`.
`assertValidWorld`, and therefore serialization, hashing, and deserialization,
enforce the published rule; the normal `tick` advances `dayIndex` before
validating and publishing the completed world. `runEconomicDay` and direct close
calls are staging operations, and their unadvanced state is not serializable
until the day advances.

**Summary validation.** Persisted summaries are ordered, unique, and contiguous:
the first `periodStartDay` equals `World.startDayIndex`; each later start is the
previous end + 1; every end is a civil month-end. There is at most one summary per
civil month, and the history is capped at the campaign's monthly periods; no
summary extends beyond the current day; the last end equals `closedThroughDay`;
and `closedThroughDay` is `null` exactly when there are no summaries. Account
totals use canonical decimal account-id keys, reference existing accounts, omit
zero values, and keep non-equity total values nonnegative. Flow values are finite
and nonnegative, and each equals the mapped expense total frozen in the same
summary. The summary's account totals also satisfy the accounting identity. An
unadvanced (`closedThroughDay === dayIndex`) state is rejected by published
validation, serialization, hashing, and deserialization until the day advances.

**M2-only, terminal, and leap behavior.** M2-only worlds never close and create no
summaries. The terminal boundary is not a close day. Gregorian month lengths are
honored, including 29-day February in leap years and 28-day February in 1900.

**Persistence and compatibility.** `FinanceState` gained `periodSummaries` and
`closedThroughDay` in M4b. Summaries are encoded sorted by period end with
canonical account and flow keys, included in hashing and deep cloning, and
validated on decode. M4c adds no summary fields and keeps the four flow kinds.
World schema is **9**, simulation version **0.9.0**, save format **1**, and the
data version remains `m3-economy-v1` because no shipped scenario data changed.
Schema-8 / simulation-0.8.0 saves are rejected with an actionable error; no
migration is implemented (D-013). No `World.history` collection is added.

### 5.4.3 M4c government fiscal model, extended by E2 (current)

M4c makes a per-country treasury and a provisional fiscal policy authoritative. It
is the approved design recorded in D-048. **E2** extends the same state and posting
model with an income-tax exemption, welfare eligibility, a treasury reserve floor, a
business-profit tax, and player financing actions; the E2 decisions are recorded in
D-073 and the implementation record is §17A.18. The M4c account rules below remain
in force.

**Country and household accounts.** Every country owns exactly one
`treasury-cash` (asset, designated cash), `income-tax-revenue` (revenue),
`business-tax-revenue` (revenue, E2), `welfare-expense` (expense), and
`owner-equity` (equity) account. The treasury id is scenario-declared
(`CountryInitialDef.treasuryAccountId`); the remaining country accounts are
deterministically allocated above the declared-id floor. Opening treasury cash
(`CountryInitialDef.initialTreasuryCashRUSD`) is applied once through
`applyOpeningBalances` with the country equity account as its counterpart; opening
revenue/expense balances remain rejected. Every pop block in a world that declares
at least one country owns `income-tax-expense` (expense) and `welfare-income`
(revenue) in addition to its existing cash, equity, wage-income, and
consumption-expense accounts. Every building in such a world owns
`business-tax-expense` (expense, E2). Countryless M2/M3 fixtures retain their
original owner account set and have no fiscal system, preserving their behavior and
benchmark baseline; validation requires the fiscal account set whenever the world
contains a country.

**Fiscal policy.** `Country.fiscal` carries `incomeTaxRate` (dimensionless, 0..1),
`incomeTaxAllowanceRUSDPerYear` (nominal per-pop-block annual exemption, finite,
nonnegative, bounded), `welfareBudgetRUSDPerYear` (nominal RUSD/year, finite,
nonnegative, bounded), `welfareMaxWealthLevel` (inclusive block wealth ceiling,
integer 0..99; 99 is universal), `businessProfitTaxRate` (dimensionless, 0..1), and
`reserveTargetRUSD` (treasury liquidity floor, finite, nonnegative, bounded). It is
scenario-initialised provisional state, not law-bounded; M8 may replace the rates
with enacted taxation and budget laws. The shipped scenario declares only the M4c
rate and welfare budget; every E2 field starts at its neutral default (zero
exemption, universal eligibility, zero business tax, zero reserve) so the accepted
M4c/M5b behavior is preserved until the player acts. Collection efficiency is fixed
at 1.0 because no bureaucrat, institution, or administrative-service model exists
yet.

**Income tax.** Once per processed day, in the fiscal phase after settlement, a
residence-based tax is withheld from each pop block as
`incomeTaxRate × max(0, wages actually received that day −
incomeTaxAllowanceRUSDPerYear / daysInYear(civil year))`. The residence country is
the country that owns the block's region. There are no strata, wealth taxes, or tax
on welfare. Partial wage payments produce proportionally partial tax, and multiple
employers are already combined by settlement into one daily receipt. The posting
debits `income-tax-expense`, credits `household-cash`, debits the country
`treasury-cash`, and credits `income-tax-revenue`. Gross `wage-income` and the
employer's `wage-expense` are unchanged. Tax cannot exceed received wages or the
block's cash; a violation is reported as an implementation error without mutation.

**Welfare transfer.** Once per processed day, `requested =
welfareBudgetRUSDPerYear / daysInYear(current civil year)`. Eligible blocks are
those with positive population whose wealth level is at or below
`welfareMaxWealthLevel`; the payable amount is the lesser of `requested` and the
treasury cash available after that day's income-tax receipts and above
`reserveTargetRUSD`. Payable is allocated across eligible blocks in proportion to
population in ascending block-id order; the final recipient receives the exact
remainder, so allocations sum exactly to payable without a random draw. The posting
debits `welfare-expense`, credits each block's `welfare-income`, debits each block's
`household-cash`, and credits `treasury-cash`. If the treasury cannot fund the
request, only the payable amount is transferred, the difference is recorded in the
month-to-date budget memo as a shortfall, and no debt, arrears, receivable, or
negative cash is created. A zero budget creates no posting; with no eligible block
the requested amount is reported as shortfall because there is no recipient.

**Business-profit tax (E2).** Once per civil month-end, after the daily fiscal phase
and before the debt phase and the monthly close, `businessProfitTaxRate` is assessed
on each building's already-recognized current-period result
`sales-revenue − input-expense − wage-expense − upkeep-expense`, using only the
positive part. Losses are not refunded or carried forward as a tax deduction (M5a
retained profit already absorbs losses for distribution). The tax is collected from
the building's actual `operating-cash`, so an assessment above available cash
creates an explicit uncollected shortfall rather than a receivable or negative cash.
The posting debits the building's `business-tax-expense`, credits its
`operating-cash`, debits the country's `treasury-cash`, and credits the distinct
`business-tax-revenue`; it is a cash-neutral transfer and is never income-tax
revenue. The tax expense and revenue are recognized in the period that generated the
profit, the close zeroes them, and the M5a distribution uses the after-tax result.
A second assessment for the same country and day is rejected.

**Treasury reserve (E2).** `reserveTargetRUSD` is a liquidity floor, not a spendable
pool or a separate account. Daily welfare may not draw treasury cash below it, and a
**discretionary** player principal repayment may not either. It never causes
borrowing and does not restrict contractual coupon, maturity, or arrears payments;
an explicit shortfall is preferred to an implicit liability.

**Atomicity, guards, and result.** The fiscal phase is an internal stage invoked by
`runEconomicDay` and is deliberately not re-exported from the package root. It
validates the world, the processed day (including terminal-boundary rejection), the
settlement's world/day/seed/scenario/start-day/market context, a stale posting
boundary, and a single-use marker before staging anything. The day's income-tax
entries and then its welfare entries are posted as two balanced batches on an
isolated finance clone (paying from the exact post-tax treasury balance avoids a
floating residual when the entire available cash is transferred); the complete
staged world is validated and treasury reconciliation is checked before the clone
replaces `world.finance`. Any failure leaves the original accounts, postings,
posting ids, summaries, close boundary, and settlement consumption state unchanged.
The transient phase result reports per-country income tax, requested/paid welfare,
shortfall, eligible block/population counts, start/end treasury cash, reserve target,
and per-block tax/welfare amounts plus `endingCashAfterFiscalRUSD` read from the
staged authoritative account. The supported simulation entry point remains
`tick`/`runEconomicDay`; tests import the phase module directly only to exercise
staging and guards.

**Posting structure.** The central fiscal validator requires each `income-tax` or
`welfare-transfer` entry to contain its recognition and cash legs with matching
per-block and country totals: income tax needs household tax expense/cash plus
country treasury/tax revenue; welfare needs country welfare expense/treasury plus
household cash/welfare income. Cash-only or incomplete fiscal postings are
rejected for single, batched, and persisted validation. This is structural
validation only and does not claim to prove that an amount was economically
justified by a specific wage or budget calculation.

**Government period totals.** `governmentPeriodTotals(finance, summary)` derives
per-country income-tax revenue, welfare expense, and net fiscal result from a
frozen M4b summary's `accountTotals` plus the current account registry. It stores
no redundant totals and does not add a flow kind.

**Monetary precision.** Authoritative RUSD amounts remain continuous binary64
`number` values in a fixed deterministic order; there is no cent quantization,
decimal money type, or fixed-point migration. `MONEY_TOLERANCE_RUSD = 1e-6` is
used for invariant/reconciliation comparisons only, never as a rounding operation
on balances. The welfare residual rule is proportional by population in ascending
block-id order with the exact remainder and no random draw. D-049 records the
full policy; display formatting belongs to a future UI layer.

**Transient cash fields.** Settlement results report
`endingCashAfterSettlementRUSD` (after market/wages/upkeep, before fiscal). Needs
results report `budgetStartBeforeNeedsRUSD` and `budgetEndAfterNeedsRUSD` (before
and after needs spending, before fiscal). Fiscal block results report
`endingCashAfterFiscalRUSD`. Only the authoritative ledger balance is final
end-of-day cash; these transient fields are phase-qualified and must not be
presented as final cash.

**Validation.** Non-finite, negative, or out-of-range fiscal values; missing,
duplicated, mismatched, or wrongly owned country accounts; a treasury reference
that is not the country's own `treasury-cash`; duplicate or colliding treasury
account ids; and opening revenue/expense balances are rejected before mutation.
When any fiscal policy is nonzero, every region containing pop blocks or
buildings must be claimed by exactly one country. Countryless and zero-fiscal
worlds remain valid and economically unchanged.

**Persistence and compatibility.** `Country.treasuryAccountId`,
`Country.fiscal`, the country accounts, and the per-block fiscal accounts are
encoded, hashed, deep-cloned, and validated on decode. `WORLD_SCHEMA_VERSION` is
**9**, `SIM_VERSION` is **0.9.0**, save format remains **1**, and `dataVersion`
remains `m3-economy-v1` (no shipped scenario data). Schema-8 /
simulation-0.8.0 saves are rejected with no migration (D-013).

### 5.4.4 M5 multi-region, multi-market, migration, and labor-access model (current)

M5 extends the single-region/single-market M3f/M4c economy to a validated
multi-country world. It is the accepted design recorded in D-051–D-055. It does
not add M5a profit distribution/remittances, M5b debt/deficit financing, banking,
monetary issuance, FX dynamics, inflation, or new tax categories.

**Ownership and market membership.** `Country.regionIds` remains the sole
country-to-region ownership mapping and `Market.regionIds` is the authoritative
market membership; `Region.marketId` is validated to agree with it. With markets
present, every region belongs to exactly one market and every country's regions
belong to one market. A country's regions may span multiple markets only under a
future customs-zone design, not in M5. `Region.popBlockIds` and
`Region.buildingInstanceIds` remain validated derived indexes of the
authoritative block/building `regionId` fields. Buildings and their owning
household must be in the same country. Countryless multi-region economy fixtures
remain valid; countryless regions form one unrestricted area.

**Market clearing.** Every market is a single inventory/price pool and is cleared
exactly once per economic day in ascending id order. Production, input
reservations, storage capacity, final overflow, prices, and the inventory
conservation identity are scoped to that market. Household demand is generated
from a block's own market prices and opening cash; production demand uses the
building's own market. A shared-market region therefore contributes its goods,
demand, and inventory exactly once. Settlement merges all markets' pending
transactions into one atomic posting batch and pays wages and upkeep once per day.
Imports, exports, inter-market physical trade, cross-market transport charges,
tariffs, and a rest-of-world trade account are **not** implemented in M5; those
mechanics are not specified by this design. Cross-region and cross-country goods
transactions occur inside a shared market through the ordinary M3e transaction
kinds.

**Migration.** Migration is an explicit monthly demographic flow between two
existing population blocks with the same profession in different regions. It runs
on the first civil day of a month, not on `startDayIndex` or the terminal
boundary, after the day's first employment allocation. It moves an integer number
of people, splits the source's single-year sex/age cells proportionally with
deterministic largest-remainder allocation, and conserves world population
exactly. Migrants carry a pro-rata share of household cash through a balanced
`migration-transfer` posting. Destination literacy, wealth, and militancy are
population-weighted merges; the destination block retains its needs-history
counters; fractional demographic remainders stay with their original blocks. No
migration block is created, and no free migration pool or fixed population
increment exists.

Migration pressure is
`0.7 × max(0, destination vacancy rate − source vacancy rate) + 0.3 × max(0,
wealth gap / 100)`, where vacancy rate is unfilled job slots divided by eligible
regional workforce (0..1). The monthly migrant fraction is
`min(0.01, pressure × 0.01)` of the source population; a source block moves at
most once per month; a destination region absorbs at most 1% of its
start-of-month population in one month. These coefficients are **provisional** and
stand in for transport/housing friction until those systems exist. Domestic
migration is always allowed. Cross-country migration requires the destination
country's provisional `immigrationOpen` policy; emigration is unrestricted in M5.
The GDD's open-border law is deferred to M8.

**Labor access.** A resident may take a job in any region of their own country.
Vacancies are filled domestic-first; only remaining vacancies in a destination
country whose `immigrationOpen` flag is true may be filled by residents of other
countries. Qualification, participation, job-slot, and eligible-workforce caps are
unchanged. Migration marks employment dirty and triggers an immediate
deterministic refresh in the same day. Cross-border wages go to the resident
household and are taxed in the household's residence country, preserving M4c
fiscal ownership.

**Historical data.** M5 adds a source-annotated historical pipeline and eight
authored 1900 sample polities under `packages/data/data/historical/` (United
States, United Kingdom, German Empire, France, Russian Empire, Empire of Japan,
British India, and Brazil; 16 regions, 5 markets, 64 blocks, 81 buildings). The
validator checks identifiers, references, ownership/market membership, ranges,
monetary/fiscal values, source metadata, and calibration metadata with
deterministic errors. Population totals are rounded source-referenced estimates;
occupation composition and other structure are explicitly provisional. The
sample is not a world total, and M5 does not claim century-scale historical
population or occupation-trend calibration (no profession promotion/demotion and
no calibrated M3 recipes/needs). See D-053 and the data source notes.

**Persistence and compatibility.** M5 persists `Country.immigrationOpen` and
therefore raises `WORLD_SCHEMA_VERSION` to **10** and `SIM_VERSION` to **0.10.0**;
save format remains **1** and `dataVersion` remains `m3-economy-v1` because no
existing definition or scenario meaning changed (D-053). Schema-9 /
simulation-0.9.0 saves are rejected with an actionable error and no migration
(D-013). Multi-market state uses the existing `Market` shape; no duplicate
inventory or derived market collection is persisted.

### 5.4.5 M5a profit distribution and state-enterprise remittances (current)

M5a is implemented as an extension of M5 and does not change M4b close semantics
or M4c fiscal behavior. It is the accepted design recorded in D-056.

**Policy.** `World.profitDistribution` is persisted, scenario-initialised policy:
`enabled` (default false for legacy fixtures), `privatePayoutRate` (default 0.5),
and `stateRemittanceRate` (default 1.0), each rate in 0..1. The M5 eight-polity
historical campaign enables it. This is not a player/AI action control.

**Ownership and accounts.** In an enabled world every building owns a
`retained-profit` equity account in addition to its owner-equity, revenue, expense,
and operating-cash accounts. A building's owner is private (a pop-block household,
with `ownerAccountId` pointing to that household's cash account) or state (the
owning country, with `ownerAccountId` pointing to the country treasury-cash
account and that country owning the building's region). Building definitions must
permit the selected ownership kind. State ownership is rejected when the policy is
disabled.

**Timing and amount.** At each economic month-end, immediately after the atomic
M4b close and before the day advances, each building's closed period net result
is `sales-revenue − input-expense − wage-expense − upkeep-expense` from the frozen
pre-close summary. A nonzero result is reclassified between owner equity and
retained profit (`profit-retention`). The building then allocates
`rate × max(0, retainedProfit)`, using the private payout rate or the state
remittance rate, capped by actual post-close operating cash. The remainder stays
as retained profit; a cash-capped shortfall is retained, never deferred or
recorded as a liability. Losses are carried as negative retained profit and later
profits offset them; no distribution occurs while retained profit is non-positive.

**Postings.** `profit-retention` moves value only between one building's
owner-equity and retained-profit accounts. `profit-distribution` moves building
cash to the designated owner household's cash and credits that household's owner
equity. `state-enterprise-remittance` moves building cash to the country treasury
and credits country owner equity. All three are aggregate-cash-neutral, have no
revenue/expense legs, add no flow kind to the M4b summary, and are structurally
validated for exact leg counts, matching owners/amounts, and required sides. The
phase validates policy, closed month-end, latest summary, close context, and a
duplicate-execution marker before staging; it stages on a finance clone,
re-validates accounts, postings, summaries, accounting identity, and aggregate
cash conservation, and only then replaces `world.finance`.

**Non-goals and persistence.** M5a adds no corporate/dividend/capital-gains tax,
securities market, share issuance/trading, banking, debt, deficit financing,
arbitrary distribution controls, or M5b behavior; state-enterprise receipts are
not income-tax revenue and do not enter `governmentPeriodTotals`. World schema is
**12**, simulation version **0.12.0**, save format **1**, and `dataVersion`
remains `m3-economy-v1`; schema-11/simulation-0.11.0 saves are rejected with no
migration (D-013).

### 5.4.6 M5b public debt and deficit financing (current)

M5b extends the finance ledger with versioned public-debt contracts, daily interest
accrual, monthly coupons, maturity and principal repayment, refinancing, explicit
arrears, and explicit default. It is a public-finance system, not banking or
monetary policy.

**Issuers and holders.** A country treasury issues RUSD debt. The holder must be an
existing simulated entity: another country's treasury-cash account or a pop block's
household-cash account. The issuer may not hold its own debt. This permits domestic
and foreign creditors without creating a bank, central bank, external investor pool,
or unexplained cash. No bond market, auction, or market-determined price exists.

**Policy and contract state.** Each country has a scenario-initialised `DebtPolicy`:
`enabled`, creditor kind/id, annual coupon rate, term in civil days, maximum
outstanding principal, refinance-on-maturity, and arrears grace days. The default is
disabled with a zero ceiling. `FinanceState.debtContracts` persists contract version
1, issuer, holder kind/id, original and outstanding principal, coupon, issue and
maturity days, accrued interest, status (`active`/`arrears`/`repaid`/`defaulted`),
and arrears start day. `FinanceState.welfareRequestedThisMonth` is a month-to-date
budget memo for financing, not a liability, and resets at close.

**Bounded contract storage.** `debtContracts` retains all active/arrears contracts
plus the most recent **32** terminated records. Older terminated records are removed
only after their principal/default history is folded into
`FinanceState.debtHistory`, one aggregate per issuer (`contractsRetired`,
`contractsDefaulted`, `principalIssuedRUSD`, `principalRepaidRUSD`,
`principalWrittenOffRUSD`, `interestWrittenOffRUSD`). Active contracts are capped at
**64**; explicit issuance beyond the cap fails, while automatic financing reports
the amount as unfinanced. A hard cap never silently omits an outstanding liability;
only zero-balance terminated detail is compacted. `nextContractId` remains
deterministic. Maturity is capped at the campaign terminal boundary. Rates, terms,
ceilings, caps, and grace periods are provisional structural inputs, not calibrated
or mutable controls.

**Accounts.** When at least one country enables debt (or contracts exist), every
country has `debt-liability`, `interest-payable`, and `interest-expense` issuer
accounts plus `bond-asset`, `interest-receivable`, and `interest-income` holder
accounts; every pop block has the three holder accounts. Disabled worlds have no
debt accounts and no debt overhead.

**Issuance and cash.** Issuance debits issuer treasury cash and credits issuer debt
liability; it debits holder bond asset and credits holder cash. It is cash-neutral
overall and never creates money. Issuance requires actual holder cash and
outstanding-principal headroom, and uses the country's designated creditor. The
explicit issuance operation is staged, validated, and atomic.

**Interest.** Interest accrues daily on outstanding principal using the actual civil
year length (365 or 366), starting the day after issuance. Accrual debits issuer
interest expense and credits interest payable; it debits holder interest receivable
and credits interest income. Coupons are paid at each civil month-end, and accrued
interest is also settled at maturity. Payment reduces interest payable and issuer
treasury cash, and increases holder cash while reducing interest receivable. Unpaid
interest remains an explicit liability/receivable and marks the contract `arrears`.

**Maturity and refinancing.** On the maturity day, accrued interest is settled first.
If policy permits refinancing and the outstanding-principal ceiling holds, a
replacement contract is issued to the same holder and the old principal is repaid in
the same batch, showing both sides. Otherwise available treasury cash repays
principal. Partial or unpaid principal leaves the contract outstanding in `arrears`
with an explicit start day. Arrears may be cured by later principal repayment before
the grace period ends.

**Arrears and default.** After `arrearsGraceDays` from the first arrears day,
remaining principal and accrued interest are written off explicitly: the issuer
debits debt liability/interest payable and credits owner equity; the holder credits
bond asset/interest receivable and debits owner equity. The contract becomes
`defaulted` with zero outstanding. No cash moves, no revenue/expense flow is created,
and no obligation is silently erased.

**Deficit and financing rule.** At each month-end, after daily interest accrual and
before the M4b close, a debt-enabled country computes a **financing requirement**:

`max(0, welfareRequestedThisMonth + interestExpense - incomeTaxRevenue - treasuryCash)`

`welfareRequestedThisMonth` records the budgeted daily welfare requests actually
accrued during the month, including amounts that could not be paid. Actual
`welfare-expense` remains cash-basis, and unpaid welfare is a reporting memo, not a
payable or liability; borrowing never posts retroactive back-pay. Treasury cash
includes prior state-enterprise remittances, so a country with sufficient liquidity
does not borrow merely because remittance cash is not income-tax revenue. The
requirement is capped by the designated creditor's actual cash and outstanding
headroom; the active-contract cap is an explicit additional constraint. Borrowing
proceeds are financing, not revenue. Any unissued requirement is reported as
`unfinancedDeficitRUSD`; no invisible liability is created. Principal repayment is
not expenditure. `governmentPeriodTotals` reports interest expense and a net fiscal
result including it; the M4b four flow kinds remain unchanged. The accounting fiscal
result and the liquidity-based financing requirement are distinct reported measures.

**Atomicity.** The phase clones finance and applies accrual, financing, coupons,
maturities, refinancing, and default, then validates accounts, contracts, postings,
summaries, accounting identity, and aggregate designated-cash conservation before
publishing. Failures leave the authoritative world unchanged.

**Scenario activation and compatibility.** The shipped eight-polity scenario enables
debt for the USA (the designated player country) only: welfare budget 2,000,000
RUSD/year, opening treasury 100,000 RUSD, creditor GBR, 4% annual coupon, 365-day
term, 1,000,000 RUSD ceiling, refinance on maturity, 365-day arrears grace. These are
provisional authored inputs, not historical calibration. The other seven countries
remain debt-disabled. Since the player country is exempt from AI fiscal decisions,
its authored fiscal/debt policy is not silently overwritten; debt financing itself
is automatic at month-end and is not a player/AI debt action.

**Schema and compatibility (Batch 4).** World schema **16**, simulation **0.16.0**,
save format **1**, `dataVersion` **`m3-economy-v3`**. Schema-15/older saves are
rejected; no migration. M5b still does not add banking, deposit money, a central
bank, monetary issuance, bond-market pricing/auctions, derivatives, external
investors, debt-to-GDP targeting, interest taxation, or player/AI debt issuance
actions.
### 5.5 Minimum supporting contracts

The `World` interface above references supporting types so the core package can
compile before later systems are implemented. Keep these types small; extend their
fields only when their milestone begins. Future-system collections may be empty,
but types must be real rather than `any` placeholders. The current M0–M4c schema
is described in the preceding baseline note; later-system collections are added
when their owning milestone begins.

```ts
type LawSlot =
  | 'suffrage' | 'taxation' | 'education' | 'health' | 'labor'
  | 'militaryService' | 'trade' | 'colonialPolicy' | 'currency';

type EffectTarget =
  | 'buildingOutput' | 'workerProductivity' | 'birthRate' | 'deathRate'
  | 'literacyGrowth' | 'taxCollection' | 'institutionService'
  | 'migration' | 'militancy' | 'marketAccess';

type RuleEffect =
  | { kind: 'modifier'; target: EffectTarget; value: number; subjectId?: Id }
  | { kind: 'unlockBuilding'; targetDefinitionId: Id }
  | { kind: 'unlockLaw'; targetDefinitionId: Id };

type TechnologyEffect = RuleEffect;
type LawEffect = RuleEffect | { kind: 'taxRateBounds'; taxType: string; min: Rate; max: Rate };

interface InstitutionState {
  fundedAnnualRUSD: MoneyRUSD;
  staffedByProfession: Record<Id, Count>;
  serviceOutputIndex: number;
  quality: Rate;                       // derived/cached from staffing, funding, and institutions
  overload: Rate;                      // derived/cached from demand versus service output
}

interface TechnologyState {
  completedIds: Id[];
  projectWork: Record<Id, number>;      // accumulated work for each named project, not a fungible pool
  researchersAssigned: Record<Id, Count>;
}

interface InterestGroupState {
  id: Id;
  key: string;
  membershipPopulation: number;        // derived/cached from pop blocks
  organization: Rate;
  influence: Rate;                     // derived/cached, never spendable
  stanceByLaw: Record<Id, number>;
}

interface AIState {
  nextEvaluationDay: DayIndex;
  currentGoalId: string | null;
  lastDecisionDay: DayIndex | null;
  lastActionSummary: string | null;     // diagnostics only; not a source of authority
}

interface FinancialAccount {
  id: Id;
  ownerKind: 'popBlock' | 'building' | 'country' | 'system'; // current M4a-1/M4c; centralBank/bank/foreign future
  ownerId: Id | null;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subtype: string;                     // validated functional subtype
  balanceRUSD: MoneyRUSD;              // normal-side units; signed only for equity
}

interface JournalLine {
  accountId: Id;
  side: 'debit' | 'credit';
  amountRUSD: MoneyRUSD;               // strictly positive
}

interface JournalPosting {
  id: number;
  dayIndex: DayIndex;
  transactionKind: string;             // validated transaction-category key
  lines: JournalLine[];                // sum of debits must equal sum of credits
  sourceEntityId: Id | null;
  targetEntityId: Id | null;
}

interface DebtContract {
  id: Id;
  contractVersion: 1;
  issuerCountryId: Id;
  holderKind: 'country' | 'popBlock';
  holderId: Id;
  principalRUSD: MoneyRUSD;
  outstandingPrincipalRUSD: MoneyRUSD;
  annualCouponRate: Rate;
  issueDay: DayIndex;
  maturityDay: DayIndex;
  accruedInterestRUSD: MoneyRUSD;
  status: 'active' | 'arrears' | 'repaid' | 'defaulted';
  arrearsSinceDay: DayIndex | null;
}

interface FinanceState {
  accounts: FinancialAccount[];
  debtContracts: DebtContract[];       // current M5b
  periodSummaries: FinancePeriodSummary[]; // current M4b: monthly closed periods, ordered by end
  annualSummaries: AnnualFinanceSummary[]; // current M7a: annual closed periods, ordered by year
  corrections: FinanceCorrection[];    // current M7a: bounded audited corrections
  auditBuffer: JournalPosting[];        // bounded recent history only; current M4a-1/M4b uses `postings`
  nextPostingId: number;
  nextCorrectionId: number;             // current M7a
  nextAccountId: number;                // current: deterministic derived-account allocator
  opening: OpeningBalanceRecord | null; // current: atomic opening-balance provenance
  closedThroughDay: DayIndex | null;    // current M4b: last closed period end, or null
}

interface FinancePeriodSummary {
  periodStartDay: DayIndex;
  periodEndDay: DayIndex;
  accountTotals: Record<Id, MoneyRUSD>;   // pre-close trial balance, nonzero accounts only
  flowTotalsByKind: Record<string, MoneyRUSD>; // the four current flow kinds; M4c fiscal totals are derived, not added
}

interface AnnualFinanceSummary {           // current M7a
  year: number;                            // 1900..1999
  periodStartDay: DayIndex;               // may be mid-year for the first partial year
  periodEndDay: DayIndex;                 // 31 December
  complete: boolean;                       // periodStartDay is 1 January
  fiscalTotals: Record<Id, FinancePeriodFiscalTotals>; // annual flows
  flowTotalsByKind: Record<string, MoneyRUSD>;         // annual world gross flows
  closingBalances: Record<Id, AnnualClosingBalances>;  // year-end stocks
  correctionCount: number;
}

interface FinanceCorrection {              // current M7a
  id: number;
  dayIndex: DayIndex;
  postingId: number;
  originalPostingId: number;
  reason: string;
  lines: JournalLine[];
}

interface Treaty {
  id: Id;
  partyCountryIds: Id[];
  kind: string;
  status: 'proposed' | 'active' | 'suspended' | 'terminated';
  effectiveDay: DayIndex | null;
  expiryDay: DayIndex | null;
}

interface Army {
  id: Id;
  countryId: Id;
  regionId: Id;
  personnel: Count;
  equipmentByGood: Record<Id, number>;
  organization: Rate;
  supplyStatus: Rate;
}

interface ScheduledEvent {
  id: string;
  triggerKind: 'date' | 'condition';
  effectiveDay: DayIndex | null;
  conditionKey: string | null;          // validated against a registered condition handler
  applied: boolean;
  effectKeys: string[];                 // validated against registered effect handlers
  provenanceNote: string;
}

interface AnnualSample {
  year: number;
  countryId: Id | null;                 // null denotes world aggregate
  metrics: Record<string, number>;
}

interface HistoryBuffers {
  annualSamples: AnnualSample[];        // capped; no per-day chart history
  monthlyFinanceSummaries: FinancePeriodSummary[];
}

interface SimulationDiagnostics {
  invariantFailureCount: number;
  invalidActionCount: number;
  eventApplicationCount: number;
  recentWarnings: string[];             // bounded diagnostic buffer
}
```

Rules for these contracts:

- Replace broad `string` categories with validated unions or registered keys as the relevant subsystem is implemented.
- `RuleEffect` is data, not executable code. Effect handlers are explicitly registered and tested; do not load arbitrary functions from JSON.
- `InterestGroupState.influence`, `InstitutionState.quality`, and `overload` are derived/cached indicators, not spendable resources.
- Keep the finance audit buffer bounded. Long-run finance history belongs in the M4b monthly period summaries, not in `postings`.
- Later military/diplomacy types may grow, but empty M1 collections must not cause fake behavior or create daily work.
- **Current M6:** `AIState` is implemented on `Country.ai` with exactly the four fields shown, and `World.countryAI.enabled` is the scenario-provided enable policy. No other sketched political/military type is implemented.

### 5.6 Static/runtime split and serialization

- Definition files are immutable, versioned data and may be cached after validation.
- Runtime state must round-trip through the canonical serializer without loss of type or meaning.
- Typed arrays must be explicitly encoded and reconstructed; plain `JSON.parse` is not sufficient to restore typed-array instances.
- Use a versioned save envelope: schema version, simulation version, content/data version, day index, seed, state payload, checksum, and optional migration metadata.
- Save migration must either convert a known older version or reject it with an actionable message. Never silently load incompatible state as if it were valid.

---

## 6. Population, needs, and social mobility

### 6.1 Population blocks

Population is aggregate. A pop block represents a region × principal socioeconomic occupation/household type. It includes dependents, not only workers. Never simulate an individual person.

The authoritative age state is **single-year and sex-separated**: `maleByAge` and `femaleByAge` are `Uint32Array(81)`. Indices `0..79` are single years of age; index `80` is the open-ended 80+ group. The 17 five-year bands (`0–4`, `5–9`, ..., `75–79`, `80+`) are derived reporting/validation aggregates, not duplicate authoritative arrays.

At each annual ageing boundary, every person advances exactly one year. Process oldest-to-youngest, with age 79 entering 80+; 80+ never ages out. Newborns enter age 0 after deaths. Ageing must conserve population exactly. The scenario’s `World.startDayIndex` records its initial represented date; an initial January 1 is not aged before the first simulated day.

This is an aggregate single-year model, not individual simulation. Working-age population is derived from ages 15–64 inclusive across both sexes; labor supply then applies the relevant participation rate. Military manpower can only be drawn from eligible people who are not already committed to other roles.

### 6.2 Initial professions

Three strata and nine professions:

| Stratum | Professions |
|---|---|
| Lower | Peasants, Laborers, Servicemen |
| Middle | Clerks, Engineers, Bureaucrats, Academics |
| Upper | Capitalists, Aristocrats |

The model may later extend profession definitions through data without changing the simulation engine. Do not add occupations by hardcoding behavior in multiple subsystems.

### 6.3 Attributes

The v1 authoritative pop attributes are:

- `maleByAge` and `femaleByAge` single-year counts (81 slots each) and derived population/working-age totals.
- Literacy rate.
- Wealth/standard-of-living level, 0–99.
- Financial account containing the household block’s aggregate financial assets.
- Militancy, 0–1.
- Consecutive or accumulated days with unmet subsistence/basic needs, and consecutive comfort-fulfilled days used by the wealth/militancy model.
- Fractional total-birth, male-birth-split, and death remainders used to avoid systematic rounding bias.

Employment is represented by explicit employment assignments, not a single `employedAt` field. Dependents and potential workers are separate concepts even though both belong to the same pop block.

### 6.4 Needs and consumption

Needs are per-capita daily baskets organized into four tiers:

1. Subsistence
2. Basic
3. Comfort
4. Luxury

Each tier is a data-defined list of `(goodId, quantityPerCapitaPerDay)` with a policy- or wealth-dependent activation rule. A pop attempts to purchase tiers from lowest to highest. The intended long-term daily funded budget is based on available household financial assets plus income actually received in prior settlements, less mandatory payments. It does not include wages that have not yet been paid. When asset drawdown exists, it must be settled as an actual financial transaction with counterpart accounts.

**M2-only milestone limitation:** for worlds without buildings or markets, the M2
population fixture finances needs only from an explicitly supplied annual settled
per-capita income less annual mandatory payments, divided by the actual civil year
and multiplied by block population. It does not draw down savings, does not add
account balances to the daily budget, and does not mutate account balances. This is
a retained test-fixture simplification for the M2-only path, not the final
household financial model.

**Current M3f economic-world behavior:** household funded demand is derived from
the household account's opening cash, the block population, wealth activation,
need-tier order, and current prices. Same-day wages are not available before the
market phase. If opening cash cannot fully fund a tier, that tier is proportionally
funded and higher tiers are not generated; purchase settlement uses actual
counterpart accounts. Government, construction, export, and universal-income demand
are not implemented. The current behavior is a cash-safe implementation of funded
demand, not a complete model of all household assets or mandatory payments.

For each tier, record desired demand, funded demand, fulfilled quantities, and unmet
quantities. If a tier is not fully met, higher tiers are not purchased that day.
Where market stock is scarce, recipients in the same tier share supply
proportionally.

Initial effects:

- Unmet subsistence increases mortality risk and militancy.
- Unmet basic needs reduces wealth level over time and increases militancy more slowly.
- Sustained fulfillment of comfort needs supports wealth growth and lowers militancy.
- Luxury consumption has a smaller additional effect and must not outweigh subsistence/basic welfare.

Daily effects use named, calibrated coefficients in the documented population constants module. They must not be applied more than once per day, and effects must be bounded to avoid runaway values. `wealthLevel` is an indicator, never a cash or asset balance.

### 6.5 Wealth/standard of living

`wealthLevel` is a smoothed index, not a spendable currency. It reflects real consumption opportunities and income relative to needs cost. The initial target formula is provisional:

`targetWealth = clamp(intercept + slope * ln(max(perCapitaIncome / subsistenceBasketCost, epsilon)), 0, 99)`

`perCapitaIncome` and `subsistenceBasketCost` must use the **same time basis**;
the ratio is otherwise meaningless. The M2.1 implementation uses annual settled
per-capita income and the annual subsistence basket cost. In M3f, the current-day
wage receipt is annualized by the civil year, so `subsistenceBasketCost` must
likewise be an annual cost: the per-capita daily subsistence basket at current
prices multiplied by the actual civil-year length (365/366 days).

Update the block monthly toward its target using a calibrated smoothing coefficient. The intercept, slope, epsilon, and smoothing coefficient must be defined in constants with units/justification and validated against test scenarios.

**Current M3f/M4c implementation convention (provisional):** on the last civil
day of each month, after needs counters, daily militancy, and the day's fiscal
phase, the economic day updates wealth through the existing M2.1 monthly wealth
function. For this update, `perCapitaIncome` is the block's **actual settled
household cash income that day** — wages received plus welfare received — divided
by block population and annualized by the actual civil-year length (365/366
days). `subsistenceBasketCost` is the corresponding **annual** cost of the
per-capita subsistence basket at current post-market prices, using the same
civil-year length. Household cash balances are **not** treated as income.
Mandatory payments are the income tax actually withheld that day, annualized with
the same convention. Unpaid wages and unfunded welfare are not income.

This is not a trailing-month income average. The GDD does not define a monthly
income measurement window, and no authoritative monthly-income accumulator exists.
The current convention is therefore an explicitly provisional implementation
choice, not a claim of precision. An exact trailing-month estimate would require a
persistent per-block income accumulator and a compatible save-format/schema
extension; that work is not implemented and is not silently assumed. Wealth remains
an indicator and must not be used as cash or assets.

Wealth level may affect need activation, health, birth/death rates, literacy attainment, migration, and promotion eligibility. Any such dependency must be documented. Do not use wealth level as a substitute for actual cash or assets.

### 6.6 Demographics

> **Superseded direction (v2.19, D-124, assigned to P4).** World-level WPP
> schedules will supply only the age *pattern*; the *level* of each block's
> fertility and mortality becomes state derived from simulated causes, starting
> from source-backed country-specific 1900 levels. Historical series become
> calibration and validation targets only (§17J.3 P4). The text below remains
> the current implementation until P4 is accepted.
>
> **P4 implementation for review (D-142, 2026-11-05).** The WPP 2024 world 1950
> schedule is the age pattern; each block's fertility level and child (0–4) and adult
> (5+) mortality levels follow the causes listed in D-142 and start from Gapminder
> 1896–1905 levels of the province's modern country. The M2 unmet-needs mortality
> terms are replaced by calories eaten.

Demography is age-specific and sex-specific. Population changes only through explicitly counted births, deaths, and later migration. The authoritative state is the single-year `maleByAge`/`femaleByAge` arrays in §5.4; five-year bands are derived for reporting and source comparison.

#### Fertility

- Fertility is calculated from the female population in seven maternal five-year groups: 15–19, 20–24, 25–29, 30–34, 35–39, 40–44, and 45–49. Together these groups cover ages 15–49 inclusive.
- Rates are annual age-specific fertility rates (ASFR) in **live births per 1,000 women per year**. They are not a crude birth rate applied to total population.
- For civil year `y`, expected annual births are `sum_a(F_a × ASFR_a(y) / 1000)`, where `F_a` is the female count in maternal group `a`.
- Convert to daily expected births by dividing by the actual 365/366-day civil year. Accumulate fractional births deterministically per pop block. Do not systematically drop small daily birth flows.
- A documented per-profession fertility multiplier may scale expected births for the generating block. It is a provisional behavioral parameter with units/status recorded in constants/data; it must not be used to conceal a missing age-specific fertility mechanism.
- Births enter age 0 of the generating block. Split newborns into male/female using a documented sex ratio at birth; male plus female births must equal total births exactly.
- The current 1.05 male/female sex ratio at birth is **provisional** and is not yet a source-backed annual series.

#### Mortality

- Mortality is age- and sex-specific. Rates are annual central death rates in deaths per 1,000 person-years, specified by five-year age band and sex.
- Apply each five-year band rate to the single-year ages in that band; apply the 80+ rate to the open-ended 80+ aggregate.
- Convert annual rates to daily expected deaths with the actual 365/366-day year and accumulate a deterministic fractional remainder per block.
- Allocate integer deaths back to age/sex cells deterministically without exceeding any cell’s population. Exact conservation is mandatory.
- Prior-day unmet subsistence/basic needs may raise mortality through documented bounded multipliers. The modifier belongs to the need-effect model, not the historical baseline schedule.

#### Source-backed and provisional inputs

- For **1950–2000**, use source-backed annual WPP 2024 ASFR and sex-specific mortality, mapped from WPP five-year bands to the internal age model. The source conventions, units, age mapping, access date, and limitations belong in calibration/source notes.
- For **1900–1949**, the 1900 age/sex distribution and age-specific fertility/mortality remain **provisional** unless a source-backed historical reconstruction is added. The current pre-1950 mortality has a documented provisional total-population calibration factor; it is not a historical mortality observation.
- The sex ratio at birth and within-five-year-band expansion are provisional.
- Distinguish **observed all-cause historical mortality** from **future explicit event shocks**. Wars, pandemics, famines, and genocides must be modeled as explicit event effects when implemented. Applying an event death shock on top of an all-cause historical mortality schedule that already embeds that mortality risks double counting; event design must document which baseline is being used and avoid counting the same deaths twice.

#### Conservation and calibration

- Demand and flow accounting must satisfy `populationEnd = populationStart + births - deaths` (plus migration when implemented). Birth/death remainders may not create or destroy people.
- Historical validation and gameplay assumptions are separate (§15.2). Total-population agreement does not by itself validate age structure or age-specific rates.
- Do not hardcode or read target totals to force the simulation trajectory. Coefficients may be calibrated only after diagnosing a structural or data mismatch.
- Rounded GDD population anchors (approximately 1.65B/2.5B/6.1B) remain historical orientation only; they are not direct January 1 source observations and must not silently override source-backed targets.

Current M2.1 status: post-1950 WPP-initialized validation is close (approximately +0.2% at 1975 and +1.2% at 2000, with age shares within about 1.1 percentage points), while the 1900 campaign still uses provisional pre-1950 age structure/schedules. The campaign’s current 2000 difference (about +9.6%) is **not** evidence of a correct no-shock counterfactual and is **not** a successful historical calibration. Full historical demographic calibration is incomplete.

### 6.7 Employment and labor allocation

Available labor is derived from the 15–64 working-age population and profession-specific participation rates. Each building posts job slots by profession. Employment assignment must satisfy all of the following:

- Total workers assigned from a pop block cannot exceed that block’s eligible available workforce.
- Total workers assigned to a building/profession cannot exceed its jobs at current level and condition.
- A worker cannot be assigned simultaneously to two jobs or to military service and civilian employment.
- Every working-age person must be accounted for as employed, unemployed/seeking work, outside the labor force, or assigned to another defined role.
- The allocation rule must be deterministic and tested for identical outcomes regardless of incidental array ordering.

On monthly labor updates, first retain suitable existing matches where possible, then fill vacancies according to qualification, wages, travel/migration limits, and laws. The system may use a stable matching or scored-allocation algorithm, but must document it and test fairness, capacity limits, and repeatability.

**Current M5 labor access.** Assignment remains subject to the caps above. A resident may take a job in any region of their own country (internal cross-region assignment). Vacancies are filled domestic-first; only remaining vacancies in a country whose provisional `immigrationOpen` policy is true may be filled by residents of other countries. Countryless regions form one unrestricted area. A migration event marks employment dirty and triggers an immediate deterministic refresh in the same day. Cross-border wages are paid to the resident household and taxed at residence (D-052).

### 6.8 Social mobility and migration

Promotion/demotion is represented as population flows between blocks; it must not create or remove people. Promotion requires qualification thresholds such as literacy and wealth, plus available job slots or another documented economic cause. Training costs are real expenses paid to education/service providers or recorded as defined household costs.

Initial causal mechanisms:

- **Vacancy pull:** available job slots attract qualified workers.
- **Agricultural push:** underemployment, mechanization, and rural/urban wage gaps can move people from Peasants to Laborers or other professions.
- **Qualification gate:** literacy, schooling access, wealth, and legal restrictions control entry to qualified work.
- **Internal migration:** people may move to regions with higher expected welfare or job opportunities, subject to transport, housing, laws, and migration friction.
- **International migration:** requires an open-border law or event-defined exception; flows depend on wage/welfare differences, transport, and receiving-country constraints.

Migration decisions are made at aggregate scale, have explicit source and destination blocks, and conserve world population except for documented external migration. The system must be capable of reversals: do not force every industrializing country to follow a monotonic path.

**Current M5 migration.** Migration runs on the first civil day of a month and moves people between existing same-profession blocks in different regions. The source's single-year sex/age cells are split proportionally with deterministic largest-remainder allocation; population is conserved exactly and migrants carry a pro-rata share of household cash through a balanced `migration-transfer` posting. Pressure is a documented function of vacancy differences and wealth gaps; domestic migration is always allowed and cross-country migration requires the destination country's provisional `immigrationOpen` flag. The destination block's needs-history counters and all fractional remainders stay with their original blocks; destination literacy/wealth/militancy are population-weighted merges. Promotion/demotion between professions, education/training, and external migration are not implemented in M5 (§5.4.4, D-052).

---

## 7. Production, goods, markets, and prices

### 7.1 Goods in v1

Fifteen goods:

1. Grain
2. Livestock
3. Fish
4. Timber
5. Coal
6. Oil
7. Iron
8. Cotton
9. Wool
10. Steel
11. Machinery
12. Textiles
13. Clothing
14. Food Products
15. Services

Later candidates: Rubber, Chemicals, Automobiles, Electricity, Electronics, Pharmaceuticals, and other goods required by validated historical or gameplay needs.

`Services` is an intentionally aggregated service-sector output. It is a good/service category with production, demand, wages, and value added, not an arbitrary resource pool.

**Current M3 catalog status:** the implemented data baseline has **eight goods** —
grain, livestock, fish, cotton, wool, textiles, clothing, and food products. Timber,
coal, oil, iron, steel, machinery, and services remain part of the broader v1
target but are not implemented in M3a–M3f; services content is currently rejected
by the data validator rather than approximated by another good. The fifteen-good
list above remains the design target, not a statement of current completeness.

### 7.2 Buildings in v1

Thirteen building types, including a warehouse so inventory capacity has an explicit physical source:

1. Subsistence Farm
2. Commercial Farm
3. Ranch
4. Fishery
5. Timber Camp
6. Coal Mine
7. Oil Derrick
8. Iron Mine
9. Steel Mill
10. Textile Mill
11. Food Processing Plant
12. Workshop / Service Establishment
13. Warehouse

Later candidates: Railway, Power Plant, University, Hospital, Government Office, Barracks, Automobile Factory, and other historically appropriate infrastructure.

Building definitions specify input and output goods, output at full operation, workforce slots by profession, resource constraints, construction costs, maintenance costs, required technology, storage contribution, ownership options, and effects. A building instance is located in a region and has an owner; it does not belong to an abstract national bucket without a physical location.

**Current M3 catalog status:** the implemented data baseline has **eight building
types** — Subsistence Farm, Commercial Farm, Ranch, Fishery, Food Processing Plant,
Textile Mill, Workshop (currently a clothing workshop), and Warehouse. Timber Camp,
Coal Mine, Oil Derrick, Iron Mine, and Steel Mill remain part of the thirteen-type
v1 target but are not implemented in M3a–M3f. Current building instances are private
only, have no required technology or resource-cap requirement in the baseline, and
do not include service-establishment production. The target list and ownership
options remain valid future requirements, not current features.

### 7.3 Building operation

Full output is constrained by:

- Building level and physical condition.
- Filled jobs and worker productivity.
- Availability of every required input.
- Available land/resource caps or extraction limits.
- Infrastructure, disruption, laws, and technology modifiers.
- Available operating finance where the model requires prepayment.

**Current M3 status:** level, condition, filled jobs, actual allocated inputs, and
opening-cash/same-batch funding are implemented. Resource caps, technology,
infrastructure, law, and exogenous disruption modifiers are future systems and are
not applied. M3c/M3d implement input reservations, actual-input consumption,
proportional release of unused reservations, same-day output for final demand only,
and recorded storage overflow. Government procurement, construction demand, and
exports are absent.

For multiple inputs, feasible output is the minimum quantity allowed by each required input ratio and all other constraints. Inputs are consumed only in the quantity actually used. Output is credited only when produced. Any waste, spoilage, or losses must be recorded explicitly.

Production input demand is posted before production. Each day’s newly produced outputs may be purchased for final demand that same day, but they cannot supply another building’s inputs until the following day. This one-day production-chain lag removes accidental benefits from building iteration order.

### 7.4 Markets and trade zones

> **Superseded direction (v2.19, D-119, assigned to P2).** A market becomes a
> **customs territory** with one tariff authority. Independent states, dominions
> and tariff-autonomous vassals have their own; colonies and protectorates join
> their overlord; the 1900 customs unions are explicit. Political subordination
> never implies economic integration by itself (§17J.3 P2). The text below
> remains the current implementation until P2 is accepted.

A market is a pool of available goods, prices, and demand for a defined set of regions. In the first implementation, a country may use one market; additional markets and trade links are introduced when multi-country simulation is working. **Current M5:** multiple markets exist, each covering one or more regions; every region belongs to exactly one market and a country's regions belong to one market in M5. Several countries' regions may share a market (the current trade connection). Every market is cleared independently and exactly once per day with market-scoped production, storage, prices, and inventory. M5 has no imports/exports between markets, tariffs, cross-market transport charges, or external rest-of-world counterparty; those are explicit non-goals, not zero-valued placeholders in a transaction stream.

- Markets do not create stock. Stock changes only through production, imports, purchases/consumption, exports, recorded waste, or capacity-driven loss.
- Warehouse buildings and explicitly defined infrastructure contribute storage capacity.
- Excess goods beyond physical storage capacity are not silently stored. Handle them using a documented outcome such as reduced production, recorded spoilage, or a sale; do not simply delete them.
- Regions in the same market share a pooled price in v1. Transport costs apply to exchanges between markets; fine-grained intra-market logistics are deferred.
- Dependencies/colonies share the overlord’s market in the initial model unless a scenario or law defines a separate customs zone. Transfers, tariffs, and ownership income must still be recorded separately.
- Imported goods must enter through a trade transaction and an origin market or external-rest-of-world account. Never create imports to fill shortages without accounting for their cost and counterpart.

### 7.5 Market clearing and inventories

For each market and good, track opening stock, current production, imports, desired demand, funded demand, fulfilled demand, exports, losses, and closing stock. Apply the priority tiers defined in §4.3. Allocation within a tier is proportional and deterministic. **Current M5:** imports and exports between markets are zero by design (not implemented, D-051); authoritative inventory is represented by seller-attributed stock lots scoped to one market; final storage overflow is applied after Pass B and recorded per lot/owner. A shared market's inventory is counted once even when several regions contribute lots. The identity below remains binding for the implemented terms.

The closing-inventory identity must hold:

`closing stock = opening stock + production + imports - fulfilled domestic use - exports - recorded losses`

Every term uses the same unit. Closing stock must be non-negative and must not exceed capacity unless a documented temporary overflow rule is active.

### 7.6 Prices

Prices are nominal RUSD per unit. The initial price model is incremental and bounded; it is not a full equilibrium solver. Calculate market imbalance using funded demand and sellable supply, with explicit behavior when the denominator is zero.

A provisional update structure is:

`imbalance = (fundedDemand - sellableSupply) / max(fundedDemand, sellableSupply, epsilon)`

`dailyChange = clamp(kappa * imbalance, -maxDailyChange, +maxDailyChange)`

`newPrice = clamp(oldPrice * (1 + dailyChange), lowerBound, upperBound)`

> **P2b (D-136):** `sellableSupply` is the opening stock plus same-day output less the
> producers' funded input demand. Producers buy inputs only from the opening stock, so one
> day of input demand must carry over; a balanced market then holds its price.

The parameters `kappa`, `maxDailyChange`, `epsilon`, and price bounds are provisional and must be calibrated. Bounds should scale with the relevant nominal price-level/inflation index and a documented minimum/maximum relative to the base price. Do not use unnormalized demand-minus-supply divided by stock without guarding zero-stock cases.

Test that prices respond in the expected direction to sustained shortages and surpluses, remain finite and positive, and do not oscillate wildly under stable conditions. A temporary shortage should not force the price to a hard bound in one day.

**Current M3 status:** M3d implements a bounded incremental update using market
imbalance and final overflow; coefficients and bounds are provisional. It does not
use an inflation index, price-level scaling, administered prices, FX pass-through,
or a full equilibrium solver. Final overflow losses do not feed back into the same
day's price. The formula and its parameters remain provisional, not calibrated
historical evidence.

### 7.7 Wages, profits, and ownership

The intended wage model is based on profession-specific base wages, the
country/market wage index, labor scarcity, productivity, inflation/price
conditions, and applicable labor laws. Wages are not defined as "whatever revenue
remains after inputs." The targets below distinguish the current M3e/M3f baseline
from future requirements.

**Current M3e/M3f baseline (implemented and tested):**

- Wage obligations use actual `EmploymentAssignment.workers`; unfilled slots are
  not paid and a worker is not paid twice. The daily rate is
  `baseWage1900RUSDPerYear / daysInYear(civil year)`.
- Wage index, labor scarcity, productivity-wage adjustment, inflation, laws, and
  wage-productivity modifiers are not implemented.
- Wages are paid after market settlement from the employer operating account.
  Income is spendable only after settlement; same-day wages cannot fund the earlier
  market phase.
- If an employer cannot fund its obligation, it pays pro-rata up to available cash
  and reports the unpaid remainder. Unpaid wages are not a liability, debt, or
  negative balance in M3e.
- Every operational building owes
  `dailyUpkeepRUSDAtLevelOne × building.level` per settlement day, paid after
  wages from its operating account to the single system-reserve account. Condition
  and staffing do not scale upkeep in M3e; shortfalls are reported and do not
  create debt or automatic closure.
- Input costs, actual wages, and actual upkeep are separately recorded.
  Cash-basis operating profit is
  `revenue - input costs - wages paid - upkeep paid`; it is retained in the
  building operating account and is not distributed to owners in the M3/M4
  baseline.
- Household accounts change only through settled market purchases and wage
  receipts. There is no universal income, savings interest, asset drawdown beyond
  actual cash, owner-capital injection, or unexplained transfer.
- Insolvency and low productivity are possible; the baseline does not yet implement
  borrowing, reduced production, layoffs, closure, or bankruptcy rules.

**Current M5a extension (implemented, §5.4.5, D-056):** when
`World.profitDistribution` is enabled, each building's closed month-end period
result is reclassified into a `retained-profit` account, distinct from owner
capital. Private owners receive `privatePayoutRate × positive retained profit`;
state enterprise profit is remitted to the owning country treasury at
`stateRemittanceRate × positive retained profit`. Both are capped by available
operating cash; the remainder stays retained, losses are carried, and no debt or
unpaid obligation is created. The M5 historical campaign enables the policy;
legacy M0–M5 fixtures keep it disabled and retain their accepted behavior.

**Future requirements (preserved; not current features):**

- Wage obligations should eventually include the country/market wage index, labor
  scarcity, productivity, inflation/price conditions, and applicable labor laws.
- Losses reduce retained cash/equity and may trigger borrowing, reduced production,
  layoffs, or closure under explicit rules.
- Land rents or analogous resource income accrue to the designated household/owner
  class rather than appearing as free money.
- Taxes, interest, depreciation where modeled, and other costs must be separately
  recorded once those systems exist.

Do not make every building profitable by construction. Insolvency and low
productivity should be possible consequences of the model.

### 7.8 GDP and macroeconomic statistics

Define GDP using one primary calculation and one reconciliation check. The preferred primary measure is value added by production: value of final output less intermediate inputs, plus the required market-price adjustments. A cross-check may use the expenditure approach:

`GDP = household final consumption + gross capital formation + government final consumption + net exports + inventory change`

Do not add intermediate purchases twice. Use a consistent nominal/real basis, time window, and units. Country GDP, revenues, spending, exports, imports, and employment shares may be cached; document the refresh cadence. Where debt-to-GDP is used daily, use a defined trailing-12-month or annualized GDP estimate, not a stale number with an unspecified denominator.

**Current M3 status:** GDP, national accounts, country statistics, and their
reconciliation checks are not implemented. The rules above remain future
requirements; the M3f benchmark's transaction and cash totals are diagnostics, not
a GDP calculation.

---

## 8. Money, accounting, and public finance

> **Economic Management Overhaul cross-reference.** §17A.5 specifies the long-term
> fiscal policy framework (tax bases, expenditure categories, reserves, borrowing,
> repayment, refinancing, and financing constraints). §8 records the current
> implementation and remains authoritative for implemented accounting rules. The
> current subset is a flat residence-based wage income tax, a single budgeted welfare
> transfer, state-enterprise remittances, and public debt; all broader taxes,
> services, procurement, subsidies, and public-investment budgets are **not
> implemented** and require the E2–E4 stages plus the dependencies listed in §17A.

### 8.1 Accounting principles

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

**Current M4a-1/M4a-2/M4b/M4c baseline (implemented and tested):** a
category-aware, double-entry cash and recognition ledger with household,
building, country-treasury, and system-reserve accounts. Each account carries a
validated `category` and `subtype`, balances are stored in normal-side units, and
opening balances are applied once with a persisted provenance record. M3 cash
outcomes are unchanged. M4a-2 adds country/currency identity and RUSD-relative
valuation but does not change the ledger, create native-currency balances, or add
a second accounting book. M4b adds a monthly period close that recognizes the net
period result in owner equity and records an immutable monthly summary. M4c adds a
country treasury, daily income-tax withholding, a daily budgeted welfare transfer,
and the `income-tax`/`welfare-transfer` posting kinds (§5.4.3, D-048). M5b adds
country-to-country/country-to-household debt, interest, and explicit default
(§5.4.6, D-057). Banks, central banks, monetary issuance, corporate/consumption/
land/tariff taxes, reopen, and inflation/FX/monetary policy are **not implemented**.
M7a now implements annual close and controlled correction/reversal entries (§17B);
inflation measurement, exchange-rate valuation, and the reserve-backed monetary authority
are implemented in E6b (§17G); banking, credit, and a policy interest rate remain planned
dependencies.
The Ledger UI is not implemented. M3f settles market purchases, wages, and upkeep
against this ledger; M4c settles taxes and welfare.

Each transaction is represented by journal lines whose total debits equal total
credits. M4b closes the revenue and expense accounts into existing owner equity at
each month-end and stores the pre-close trial balance and gross period flows in
`FinanceState.periodSummaries` (§5.4.2); M4c country tax revenue and welfare
expense close the same way. The bounded posting buffer remains an audit ring
rather than a long-run history; the target finance system may later add annual
summaries and a `World.history` collection. Postings must be validated when they
occur, and a bounded recent audit buffer must support debugging.

A transaction must never make money appear without a counterpart entry. Valid sources include earned income, transfers from another account, borrowing, or explicit monetary issuance. Valid uses include purchases, taxes, interest, transfers, asset acquisition, losses, or redemption. Money-supply changes must be recorded, not inferred from a price index alone.

### 8.2 Financial accounts and debt contracts

M4a-1 has extended the M3 cash ledger into category-aware double-entry accounts
with opening balances, M4a-2 adds country/currency identity and valuation, M4b
adds the monthly period close and summaries, and M4c adds country treasury and
fiscal accounts. Future finance stages extend that foundation; they do not
introduce double-entry accounting from scratch. The target finance contracts add
or extend:

- `FinancialAccount`: stable ID, owner/type, account category/subtype, current balance, and optional country/sector reference. *(M4a-1 baseline: category/subtype accounts with normal-side balances; M4c adds the `country` owner kind and fiscal subtypes; no country/sector reference.)*
- `JournalPosting`: day, transaction type/source, account lines, amount, and optional entity IDs. *(Current M4c baseline implemented, including structurally validated internal `period-close` entries and cash-neutral `income-tax`/`welfare-transfer` entries.)*
- `DebtContract`: version, issuer, holder kind/account, principal, outstanding liability, annual coupon, issue/maturity, accrued interest, status, and arrears start. *(M5b current: persisted in `FinanceState.debtContracts`; §5.4.6, D-057.)*
- `FinanceState`: accounts, contracts, monthly/annual summaries, correction records, monetary aggregates, and audit buffer. *(M7a baseline: accounts, postings, nextPostingId, nextCorrectionId, nextAccountId, opening, periodSummaries, annualSummaries, corrections, closedThroughDay; monetary aggregates/`World.history` future.)*

Accounts and balances are authoritative; `Treasury.cash`, money supply, and sector totals should be derived or updated from the finance subsystem through one interface, not duplicated independently across systems.

Debt holders may be domestic households/businesses, foreign investors, or the central bank. Issuing a bond transfers funds from the purchaser’s account to the issuer, creates a liability for the issuer, and creates a matching asset for the holder. Central-bank purchases require matching entries on the central-bank balance sheet and may expand the defined monetary aggregate. Refinancing is not revenue; repaid principal is not ordinary expenditure.

### 8.3 Government revenue

**Current M4c/M5a subset: a flat residence-based income tax on wages actually
paid, plus state-enterprise profit remittance.** No land, corporate,
consumption/excise, tariff, or colonial/subject revenue is implemented, and no
collection- or administration-efficiency mechanism exists. State-enterprise
profit remittance is implemented in M5a (§5.4.5, D-056) as a balanced transfer of
already-recognized retained profit to the owning treasury; it is not income-tax
revenue and does not enter `governmentPeriodTotals`. The remaining revenue work is
specified in §17A.5 and partly scheduled to E2 (business/consumption/property
extensions) and E6a (customs); land/property and other prerequisites remain
unimplemented and explicitly dependent. No revenue control is implemented merely by
being specified.

**M4c income tax (implemented, provisional).** For each pop block, the daily tax
is `Country.fiscal.incomeTaxRate × wages actually received that day`. The rate is
dimensionless and bounded to 0..1 by a documented numeric-safety constant. The
tax base is gross wage income only: there are no exemptions, no stratum
schedules, no tax on wealth, and no tax on welfare. The residence country is the
owner of the block's region. Tax proceeds move existing household cash to the
country's `treasury-cash` account and are recognized as household
`income-tax-expense` and country `income-tax-revenue`; they are not created ex
nihilo. Collection efficiency is fixed at **1.0** because the bureaucracy,
institutions, literacy, and administration systems that must eventually derive it
do not exist yet. The rate is scenario-initialised provisional state, not
law-bounded or mutable by an action; M8 taxation laws may replace it.

Future revenue sources and their requirements remain:

| Source | Tax base / cause | Collection considerations |
|---|---|---|
| Land tax | Land value/rents and defined agricultural property base | Requires taxable assessment and collection efficiency. |
| Income tax | Household wage and other defined personal income above exemptions | Tax schedules may differ by stratum and law. |
| Corporate tax | Taxable business profits | Losses and deductions require explicit rules. |
| Consumption/excise tax | Eligible good transactions | Tax is collected once at the defined transaction stage. |
| Tariffs | Imports crossing a tariff boundary | Apply only to transactions legally subject to the tariff. |
| State enterprise profit | Actual state-owned enterprise profit remitted (current M5a, §5.4.5) | Capped by positive retained profit and available cash; recorded as a balanced remittance, not income-tax revenue. |
| Colonial/subject transfers | Defined transfers from subject administrations or regions | Record the payer, recipient, extraction/transfer rule, and political consequences. |

Collection efficiency is derived from bureaucrat staffing, literacy, funded administration, infrastructure, and institutions. A provisional formula may be used, but it must have normalized inputs, explicit units, clamps, and calibration tests. Avoid a magic `taxCapacity` variable whose own causal meaning is undefined. M4c deliberately fixes efficiency at 1.0 until those systems exist.

Tax rates are law-bounded player controls. All taxable amounts, exemptions, and timing rules must be explicit. Tax proceeds are transferred to government accounts; they are not created ex nihilo. M4c implements a single flat provisional rate; law bounds remain M8 work.

### 8.4 Government expenditure

**Current E2 subset: one budgeted per-capita welfare transfer plus business-profit
tax/administration-free collection.** No administration, military, education,
healthcare, infrastructure, subsidy, procurement, or colonial expenditure is
implemented; there is no government procurement demand (market priority tier 4) and
no government employment. Debt service is current in M5b (§17.3); E2 exposes
player-controlled borrowing, early principal repayment, and refinancing/ceiling
policy within those contracts (§17A.18). The remaining expenditure work is specified
in §17A.5 (fiscal), §17A.6 (public investment), §17A.7 (industrial/procurement), and
§17A.9 (labor/social) and assigned to the relevant E stages; none is implemented by
being specified. Profit distributions and state-enterprise remittances are transfers
of recognized profit, not government expenditure, and are implemented in M5a
(§5.4.5).

**M4c/E2 welfare transfer (implemented, provisional).** The country's
`welfareBudgetRUSDPerYear` is a requested annual nominal expenditure target, not a
spendable pool. Its daily share is
`welfareBudgetRUSDPerYear / daysInYear(current civil year)`. Eligible blocks are
those with positive population at or below `welfareMaxWealthLevel`. The payable
amount is the lesser of the request and treasury cash above `reserveTargetRUSD`
after the day's income-tax receipts, so a funding shortfall reduces the transfer
proportionally rather than creating debt, arrears, receivables, or negative cash.
Payable is allocated across eligible blocks in proportion to population with a
deterministic exact remainder and paid through household `welfare-income` and
country `welfare-expense`; the economic recipient and effect are therefore explicit
(household cash available for subsequent needs demand). The shortfall is retained in
the month-to-date budget memo and in the monthly/annual report but is not persisted
as a liability or counter.

Future expenditure categories and their requirements remain:

- Administration
- Military
- Education
- Healthcare
- Infrastructure maintenance
- Pensions and welfare
- Unemployment relief
- Subsidies
- Debt service
- Colonial administration

Spending settings express a budget target or policy priority, not a stock of spendable points. Actual expenditure creates concrete flows: government wages, services, goods purchased, transfers to households, construction/maintenance, subsidies, or interest. Every category must state its economic recipient and simulation effect.

For v1, define requested annual expenditure as a percentage of trailing nominal GDP or a documented annual budget target. Daily procurement and transfer accruals follow the calendar. If available funds are insufficient, the policy must specify whether to reduce discretionary spending, issue debt, delay payment, or default. Do not allow expenses to be paid invisibly.

Education expenditure funds teachers, schools, education services, and research institutions. Healthcare spending affects treatment capacity and health outcomes through a defined service mechanism. Military spending purchases wages, training, equipment, and infrastructure; it does not create instant units without cost.

### 8.5 Deficits, borrowing, credit, and default

**Status: current M5b public-debt subset with E2 player financing actions; no
banking, central bank, or market pricing.** Country treasuries issue RUSD debt to
another country treasury or a pop-block household. Contracts persist version,
issuer, holder, principal, outstanding liability, coupon, issue/maturity, accrued
interest, status, and arrears start day (§5.4.6, D-057). The current rule is:

- The accounting fiscal result is tax revenue (personal and business) minus actual
  welfare expense and interest expense. The **financing requirement** is
  `max(0, requested-welfare-this-month + interest-expense - income-tax-revenue -
  business-tax-revenue - treasury-cash)`.
  Requested welfare includes unpaid budget and is a memo, not a payable; deficit
  borrowing never retroactively pays earlier unmet welfare. Treasury cash includes
  state-enterprise remittances, which are financing liquidity, not tax revenue.
  Borrowing proceeds are a financing inflow that increases cash and liability,
  never revenue. Principal repayment reduces cash and liability and is not ordinary
  expenditure. Interest accrues daily as an expense and payment reduces cash; neither
  is principal repayment.
- **E2 player financing.** The player may (a) issue one discretionary contract to the
  country's designated creditor within that creditor's actual cash, the
  outstanding-principal ceiling, and the active-contract cap; (b) repay part or all of
  one outstanding contract's principal early when treasury cash covers it and the
  payment leaves cash at or above `reserveTargetRUSD`; and (c) change the
  refinancing policy and the outstanding-principal ceiling, the latter never below
  current outstanding principal. Player borrowing posts immediately and its proceeds
  increase treasury cash, so the month-end automatic financing requirement is
  correspondingly smaller; the two paths cannot borrow the same gap twice. The
  reserve floor applies only to discretionary repayment, never to contractual coupon,
  maturity, or arrears obligations. Manual refinancing of a non-maturing contract is
  not added: repay and issue are the explicit equivalent.
- Refinancing retires the old contract and issues the replacement in one validated
  batch, showing both sides. Arrears and default are explicit contract statuses with
  a grace period and an explicit owner-equity write-down; no unrecorded gap exists.
- Month-end financing is constrained by the designated creditor's actual cash, the
  outstanding-principal ceiling, and the active-contract cap. An unfinanced
  requirement is reported, not booked as an invisible liability. M4c welfare
  liquidity shortfalls remain cash-basis and are reported separately without
  creating a payable.
- No debt-to-GDP target, market pricing, bank/central-bank holder, external investor
  pool, debt auction, or AI debt action exists. E2 exposes the player controls above
  through the shared validated action path.

A deficit occurs when accrued expenditure exceeds revenue over the defined period. It must be financed by an explicitly permitted source or result in arrears/default under an explicit rule.

- Domestic issuance is constrained by domestic financial assets and willingness to hold the bonds.
- Foreign issuance depends on creditworthiness, access, external conditions, and any capital controls.
- Central-bank financing creates matching balance-sheet entries and can affect monetary aggregates and inflation.
- Bond coupons accrue daily; payments and principal maturities follow contract dates.
- Debt-to-GDP, maturity structure, inflation, credibility, external position, and institutions influence borrowing terms.
- If refinancing fails, the country may face arrears, forced spending cuts, default, capital flight, or a currency crisis according to explicit event rules.

The original debt/GDP value of 1.5 is a provisional alert threshold, not a universal law. Defaults must not happen merely because a ratio crosses one fixed threshold; liquidity, maturity, holder willingness, and policy rules matter.

### 8.6 Prices, inflation, and currency regimes

**Status: current M4a-2 identity/valuation only; future monetary systems.** M3
and M4a-1 prices and balances are nominal RUSD market/accounting values. M4a-2
adds country/currency identity and a scenario-provided or explicitly unavailable
RUSD-relative valuation. It does not implement floating or managed exchange
rates, inflation dynamics, monetary policy, central-bank operations, gold
convertibility, regime transitions, pegged exchange rates, or currency
conversion in market settlement. `CurrencyValuation.rusdPerUnit` is the RUSD
value of one unit of a currency; it is a valuation input, not by itself a peg.

All M4a-1/M4a-2/M4b monetary balances and quoted prices are stored in nominal RUSD.
A per-country inflation index and FX/regime state remain future design goals; the
v2.2 representation is superseded, and no such authoritative field exists in
M4a-2. Future aggregate rules may model macroeconomic consequences without
simulating every local-currency note and deposit denomination. This work is
planned for M8a (§17.3) and is not implemented; any monetary-policy mechanism
whose prerequisite is missing must record that prerequisite rather than hide it.

The following inflation and currency-regime material is future design, not
current behavior:

Inflation must have explicit causes, including the defined monetary aggregate, output growth, expectations, supply shocks, wage/input pressures, exchange-rate pass-through, and administered prices where appropriate. The exact combination is provisional and must be documented and calibrated. Do not update inflation solely because prices were already raised by the price system, which would double-count the same shock.

Historical starting assumptions for the baseline scenario may include:

- Gold-standard regimes in some states during 1900–1914, with country-specific departures and return-to-gold events where appropriate.
- Interwar monetary changes and crises, including but not limited to gold-standard periods.
- Bretton Woods arrangements after 1944 for participating economies, ending as the system breaks down around 1971.
- Floating or managed exchange-rate regimes in later decades.

Do not force every country into the same regime on the same day. Regime membership, pegs, capital controls, reserves, and changes must be defined by country data, laws, or historical events.

### 8.7 Finance invariants

**Current M4a-1/M4a-2/M4b/M4c:** every posted journal batch is balanced and
validated before mutation; no market batch may create a negative buyer balance;
wage/upkeep shortfalls are partial and never create debt; total cash is
conserved; the system-reserve account receives upkeep. M4a-1 adds category-aware
accounts, normal-side balances, recognition legs, and opening balances; M4a-2
adds no new cash-changing transaction kinds and no native-currency balances. M4b
adds the semantic posting matrix, exact month-end zeroing of revenue and expense,
a cash-neutral net close into owner equity, the owner-equity requirement, and
atomic staged close validation (§5.4.2, D-047). M4c adds the `treasury-cash`
designated-cash subtype, cash-neutral `income-tax` and `welfare-transfer`
postings, the requirement that country tax revenue and welfare expense close into
country owner equity, treasury non-negativity, exact tax/welfare cash
reconciliation, required fiscal recognition/cash legs, staged-clone publication,
execution-context/duplicate guards, and phase-qualified transient cash results
(§5.4.3, D-048/D-049). M5 adds the balanced, cash-neutral, asset-only
`migration-transfer` between household cash accounts; it is not a period flow kind,
cannot create or destroy money, and does not bypass treasury ownership. M5a adds
`profit-retention`, `profit-distribution`, and `state-enterprise-remittance` as
balanced, aggregate-cash-neutral allocations of already-recognized profit and
cash; they are not period flow kinds, cannot create money, and are structurally
validated for exact equity/cash legs and owners (§5.4.5, D-056). The following
debt, interest, and monetary invariants remain future requirements (debt and
interest are current in M5b; monetary invariants with M8a); the monthly
period-summary invariants are current and recorded in §5.4.2.

- Every journal posting balances.
- Every debt contract has exactly one issuer and one current holder/holder sector.
- Bond issuance creates matching liability and asset entries.
- Principal repayment reduces both the issuer’s liability and the holder’s asset.
- Tax, wages, dividends, interest, and transfers move balances between counterpart accounts.
- The aggregate monetary stock changes only through defined issuance, redemption, destruction, or reclassification rules.
- Nominal accounting must reconcile within the configured floating-point tolerance; unexplained balance drift is a test failure.

---

## 9. Politics and institutions

> **M8 implementation status (v2.12).** The §9.1–§9.5 systems are implemented for
> the scope described in §17C: seven derived interest groups, regime/eligibility and
> election state, law proposals with support/legal-path/time, regional unrest and
> crisis/revolution, administration quality/overload, and a bounded scripted-event
> queue. Only the taxation, suffrage, labor, and trade law slots carry proposable
> options; the other five slots are explicit later-stage dependencies. The prose
> below remains the binding design intent, not a claim that education/health/currency
> law mechanics or AI law proposals exist.

Politics is scheduled for M8, but the data contracts should be compatible with the population and finance model.

### 9.1 Interest groups

Initial groups: Aristocrats, Capitalists, Labor, Intelligentsia, Military, Bureaucrats, and Rural interests.

Group membership is derived from relevant pop blocks and explicitly defined organization rules. Influence is a derived indicator based on member count, wealth, literacy, organization, laws, franchise, and institutional access. It may be cached, but must be recomputable. Group stance is defined per law or issue; do not use one universal stance value for all decisions.

### 9.2 Laws

Initial law slots:

- Suffrage
- Taxation
- Education
- Health
- Labor
- Military Service
- Trade
- Colonial Policy
- Currency

Each law definition has prerequisites, eligible regimes, enactment duration, modifiers, and effects on concrete systems. Enactment requires appropriate support, a legal path, and time. Do not spend political points to enact a law.

### 9.3 Elections and regimes

Where elections apply, calculate eligibility under the suffrage law, derive votes from the enfranchised population, and apply a documented election rule. Election outcomes affect government composition and policy choices. Countries without the relevant institutions do not run elections merely because a timer expired.

### 9.4 Militancy, unrest, and instability

Militancy is a pop-level indicator; unrest is a regional indicator. Their relationship must be explicit. Sustained unmet needs, repression, unemployment, political exclusion, casualties, and institutional breakdown may increase them. Welfare improvements, reform, representation, or successful outcomes may reduce them.

Strikes, riots, revolution, regime change, and state breakdown are event outcomes with prerequisites and consequences. They must arise from defined state and not from a hidden random chance alone. Randomness may resolve uncertain outcomes only after documented causes and eligibility checks are applied.

### 9.5 Institutions and administrative services

Institutional quality is derived from staffing, funding, literacy, training, law, infrastructure, and recent disruption. Administrative overload has concrete effects such as lower tax collection, delayed construction, slower law enforcement, or reduced service provision. Do not model it as a free-floating “administrative capacity” pool.

---

## 10. Technology and education

### 10.1 Technology graph

The intended technology tree contains approximately 120 technologies across six eras. The graph must be acyclic; prerequisites must be validated at data load. A technology may unlock buildings, increase productivity, reduce mortality, support literacy growth, or enable laws and military capabilities.

**Current M9 implementation.** `technology.json` contains 120 technologies across six eras. Load-time validation rejects duplicate/non-positional ids, duplicate keys, unknown/self/repeated/cyclic prerequisites, a prerequisite from a later era, non-positive research work, and invalid effects. The authored effects are sector productivity (increases produced physical output, not capacity or inputs), mortality reduction (multiplies age/sex death rates), and education effectiveness (adds to education quality). Building unlocks are declared by `BuildingDef.requiredTechnologyId`; law enables are declared by `LawDef.requiredTechnologyIds`, so each has one source of truth. Military-capability effects are deferred to M10 and are not authored. Effects are derived from the researched set on every read; no cached factor is authoritative state.

### 10.2 Research work

Technology advances only through explicit research labor and funded institutional activity. Academics must be actual people employed in research/education institutions, or be assigned a documented share of research time. Education and institutional funding affect the number and effectiveness of researchers through defined staffing and service output.

For each active technology project:

- Record project-specific work completed and work required.
- Calculate daily work from assigned researchers, their literacy/qualification, institution effectiveness, available facilities, and funding.
- Deduct or record research inputs where the model requires material goods or operational costs.
- Complete the technology when the project’s required work is reached.
- Apply unlocks/modifiers deterministically on the effective date.

Accumulated project work is the record of labor already performed; it cannot be transferred freely between unrelated projects as a generic spendable currency. Research must not progress on days with no supporting research work.

**Current M9 implementation.** A country has at most one active project. Project work is stored per technology (`workByTechnology`) and is retained when a project is cancelled; it is never transferred to another technology. Daily work is `researchStaff × academicLiteracy × educationQuality × fundingAdequacy` researcher-days, where `researchStaff = availableAcademicWorkers × researchStaffShare`. Available academic workers are the participating working-age members of the authored academic profession minus existing academic employment assignments. Zero staff, zero research share, or zero funding yields zero work. A technology completes at the end of the day on which accumulated work reaches `researchWork`; its effects are read from the next civil day. The research phase runs after market settlement and the fiscal phase and before the industrial/business-tax/construction/debt phases. The model consumes no research material goods because no research material recipe exists; that is a recorded limitation (D-077), not a free-goods assumption. AI research selection is not implemented.

### 10.3 Literacy and education transition

Literacy growth is generated by educational access, teacher availability, attendance, school funding, urbanization, household resources, and policy. Avoid applying a universal daily literacy increment without a defined educational mechanism. Population aging, migration, and age-structure change must affect national literacy aggregates through actual age-specific values.

**Current M9 implementation.** `PopBlock.literacyByAge` is authoritative single-year literacy (81 slots). The scalar `PopBlock.literacy` is the derived population-weighted 15+ adult rate and is validated against the array. Ages under 15 start at zero because the authored scenario supplies one adult rate per block and no source-backed age-specific series exists; that is a provisional initialisation, not a historical observation. Each day the education phase raises only the school-age cohort (5–14) by `LITERACY_DAILY_GAIN × blockAttendance × quality × fundingAdequacy × (1 − literacy[age])`, where `blockAttendance = min(teachingCapacity / schoolAgePopulation, familyAttendance)` and `familyAttendance` depends on household wealth and the enacted education law's attendance floor. Teaching capacity is `teacherStaff × studentsPerTeacher`; funding adequacy is `fundedAnnual / (academicWorkers × perStaffBenchmark)`. Zero funding therefore yields no schooling service. Annual ageing shifts literacy with the people (age 79 blends into the open-ended 80+ slot) and recomputes the adult aggregate; migration merges literacy by age using the moved cells; births enter at zero. Urbanization is not separately modelled because the population data has no urban/rural split; this is an explicit M9 limitation. The education-law options `education-none`, `education-voluntary`, `education-compulsory-primary`, and `education-universal` use the M8 `propose-law` pathway, support/regime/prerequisite validation, and effective-day timing. The compulsory and universal options require researched technologies. Qualification promotion between professions, health effects, training, and social services remain E5.

---

## 11. Diplomacy, war, and territorial control

**Status (v2.17): implemented in M10 (§17H, D-081)** for the §11.1–§11.5 scope below, with
the explicit deferrals listed in §17H.7. Earlier milestones defined stable IDs and empty
collections; `World.military` is now authoritative when a scenario enables it.

### 11.1 Diplomacy

Required concepts: treaty, relation, diplomatic agreement, casus belli/war justification, market access, alliance, sanctions, recognition, subject relationship, and treaty compliance. Each agreement defines parties, terms, effective dates, expiry/termination conditions, and consequences for violation.

Diplomatic leverage is derived from reputation, treaty compliance, trade dependence, strategic access, debt holdings, military position, and other explicit relationships. No diplomatic point pool is permitted.

### 11.2 Military organization

Army manpower is drawn from eligible people assigned to military service; it is not a separate free pool. Units require equipment, supply, salaries, training, leadership, and transport. Unit formation and mobilization take time and change civilian labor availability.

An `Army`/formation must define location, assigned personnel, equipment stocks, organization/training, supply status, command, and movement state. Officer availability comes from qualified people assigned to military command; technology and staff institutions affect command effectiveness.

### 11.3 Combat and casualties

Combat resolves from manpower, organization, equipment, supply, technology/doctrine, terrain, weather where modeled, fortifications, and command. Losses are allocated to deaths, wounded, missing/captured, and temporary/permanent workforce loss according to explicit rules. Wounded people may recover through time and healthcare; deaths reduce population. Casualties must reconcile with pop changes and unit state.

### 11.4 War termination

Peace terms are negotiated or selected based on occupation, military situation, casualties, economic disruption, debt/credit constraints, unrest, treaty commitments, and political objectives. There is no abstract war-score pool. A UI summary may show a derived “war position” indicator if the formula is documented.

### 11.5 Occupation and territorial change

Occupation must not silently change sovereignty. Track controller, legal owner/sovereign, start date, and relevant occupation effects separately. Annexations, independence, partition, and border changes are explicit dated events with updates to region ownership, markets, pop records, buildings, treaties, and finances.

**M10 implementation (D-081).** Sovereignty is `Country.regionIds`; control is
`Region.controllerCountryId`/`occupiedSinceDay`. Occupation changes control only, adds
a daily unrest increment and a garrison cost paid by the controller, and never transfers
cash, buildings, people, markets, or monetary authority. A peace treaty is the only M10
sovereignty transition: white peace clears occupations; cession transfers exactly the
regions the offerer controls. Market membership stays fixed in M10, and a country cannot
cede its last region. Independence, partition, non-treaty annexation, and regime change
are rejected and recorded as deferred.

---

## 12. Country AI

**Implementation status.** M0–M6 are implemented and accepted (§17.1–§17.2d); **M8 is implemented (§17C, D-076)**, **M9 is implemented (§17D, D-077)**, **E5 is implemented (§17E, D-078)**, **E6a is implemented (§17F, D-079)**, and **E6b is implemented (§17G, D-080)**; M4's remaining finance work is not implemented, with specific extensions assigned to E2/E4/E6a (E2/E4/E6a implemented) and other bases unassigned. M7's playable shell and worker protocol are implemented, but native iOS/Android release builds and real-device performance measurements are **NOT VERIFIED**, so M7 carries a documented acceptance exception (§17.2e, D-061). **M7a annual accounting is implemented (§17B, D-072)**; M8a is implemented as E6b, and M10 is implemented (§17H, D-081). The Economic Management Overhaul has **E0 (design), E1 (Economic Clarity and Monthly Reports), E2 (Fiscal Management), E3 (Public Investment and Construction), E4 (Industrial and Business Policy), E5 (Labor and Social Institutions), E6a (Transport, Access, and Inter-market Trade), and E6b (Monetary, Foreign-Exchange, and Price-Measurement Systems) implemented** (§17.5, §17A, D-070/D-071/D-073/D-074/D-075/D-078/D-079/D-080). No later stage is implied by the existence of its support type or by this plan.

| Scope | Status |
|---|---|
| M0, M1, M2/M2.1, M3a–M3f, M4a-1, M4a-2, M4b, M4c, M5, M5a, M5b, M6 | Implemented and accepted |
| Remaining M4 finance work (specific extensions in E2/E4/E6a; other bases unassigned) | E2, E4, and E6a extensions implemented; other bases not implemented |
| M7 | Implemented (web/JS verification); native release and device acceptance NOT VERIFIED |
| M7a — Annual Accounting | **Implemented (§17B, D-072); schema 18 / simulation 0.18.0** |
| E0 — Economic Management Design Specification | **Documented (§17A); no simulation code** |
| E1 — Economic Clarity and Monthly Reports | **Implemented (§17A.17, D-071); presentation/selectors only** |
| E2 — Fiscal Management | **Implemented (§17A.18, D-073); schema 18 / simulation 0.18.0 / protocol 5** |
| E3 — Public Investment and Construction | **Implemented (§17A.19, D-074); schema 19 / simulation 0.19.0 / protocol 6 / data `m3-economy-v4`** |
| E4 — Industrial and Business Policy | **Implemented (§17A.20, D-075); schema 20 / simulation 0.20.0 / protocol 7 / data `m3-economy-v5`** |
| E5 — Labor and Social Institutions | **Implemented (§17A.9, §17E, D-078); schema 23 / simulation 0.23.0 / protocol 10 / data `m3-economy-v8`** |
| E6a — Transport, Access, and Inter-market Trade | **Implemented (§17A.8, §17F, D-079); schema 24 / simulation 0.24.0 / protocol 11 / data `m3-economy-v9`** |
| E6b — Monetary, Foreign-Exchange, and Price-Measurement Systems | **Implemented (§17A.10, §17G, D-080); schema 25 / simulation 0.25.0 / protocol 12 / data `m3-economy-v10`** |
| E6 — Trade and Monetary Economy | **E6a and E6b implemented** (§17A.8, §17A.10) |
| M8 — Laws and Institutions | **Implemented (§17C, D-076); schema 21 / simulation 0.21.0 / protocol 8 / data `m3-economy-v6`** |
| M8a | **Implemented as E6b (§17G, D-080)**; schema 25 / simulation 0.25.0 / protocol 12 / data `m3-economy-v10` |
| M9 | **Implemented (§17D, D-077); schema 22 / simulation 0.22.0 / protocol 9 / data `m3-economy-v7`** |
| M10 — Diplomacy, Warfare, and Territorial Control | **Implemented (§11, §17H, D-081); schema 26 / simulation 0.26.0 / protocol 13 / data `m3-economy-v11`** |

| Milestone | Deliverable | Definition of done |
|---|---|---|
| **M0** | Monorepo scaffold, TypeScript configuration, tests, benchmark harness, pnpm CI command | Repository installs reproducibly; `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run bench`, and `pnpm run ci` execute. No simulation behavior yet. |
| **M1** | Simulation core: world schema, calendar, keyed randomness, serializer, save versioning, empty-world no-op tick path | Calendar tests pass; exactly 36,524 processed campaign ticks reach the 2000-01-01 terminal boundary, whose tick is a no-op (there are 36,525 valid day indices including that boundary); repeat and save/resume hashes match; typed-array round-trip is verified. |
| **M2** | Population blocks, single-year sex-separated age state, age-specific fertility/mortality, needs baskets, wealth index in a single-region fixture | Single-year/sex population conservation passes; five-year bands reconcile as derived aggregates; births enter age 0 with documented sex split; deterministic fractional accumulation passes; no negative counts; unmet needs change the specified outcomes. Needs use the M2 annual-disposable-income fixture without savings drawdown or account mutation. Historical total calibration is reported separately and is not required for structural M2 completion. |
| **M2.1** | Population correction and demographic validation: authoritative single-year/sex state, exact annual ageing, ASFR fertility, sex-specific mortality, annual WPP 1950–2000 schedules, WPP-1950 validation scenario | Structural correctness, conservation, save/resume, and deterministic regression tests pass; annual age/sex and total validation against WPP is reported with absolute/relative differences. Post-1950 WPP validation is source-backed; 1900–1949 age structure/schedules remain provisional. The campaign's +9.553% 2000 difference is documented as a no-shock baseline limitation, not historical calibration success. Full pre-1950 historical calibration remains incomplete. |
| **M3** | Buildings, employment assignments, goods, production, market clearing, inventory, price updates, wages/profits, and an integrated economic tick in a small economy | Goods conservation passes; price-shock tests behave correctly; scarce-goods allocation is order-independent; no NaN/infinity; insolvent or unproductive buildings can fail without creating value. The accepted M3 baseline is delivered through stages M3a–M3f below. |
| **M4** | Finance/public-finance extension, staged: M4a-1 category-aware double-entry accounts and opening balances; M4a-2 country/currency identity, monetary arrangements, and RUSD-relative valuation; M4b monthly period close and finance summaries; M4c per-country treasury, daily income tax, and budgeted welfare transfers; remaining finance/public-finance work is not implemented, with specific extensions assigned to the Economic Management program E2 (fiscal instruments/spending), E4 (industrial/business), and E6a (customs/trade); land/property and other prerequisites remain unassigned/unimplemented | M4a-1/M4a-2/M4b/M4c acceptance is recorded in §17.2. The remaining M4 revenue/expenditure definition of done stays future: all postings balance; no money appears without a defined source; no E2/E4/E6a instrument is claimed until its own stage acceptance. The debt/interest/maturity, distribution/remittance, annual-close, and inflation/FX/monetary items formerly bundled into M4's eventual goal are reassigned by §17.3 to M5b, M5a, M7a, and M8a respectively; their acceptance criteria belong to those stages and are not M4 acceptance. M4 extends the M3a/M3e foundation; it does not introduce the first accounting interface. |
| **M5** | Multi-region/multi-country worlds, shared/trade markets, migration, labor mobility, initial historical data pipeline | Eight authored sample polities run together; data validator passes; population, goods, and finance invariants pass; occupation structure trends meet country-specific baseline ranges where data supports them. |
| **M5a** | Profit distributions to designated private owners/household capitalists or deterministic retention as business funds; actual state-owned-enterprise profit remittances to country treasuries through balanced postings (§5.4.5, §17.2b) | Ownership, timing, account semantics, and available-funds rules are explicit and deterministic; a distribution or remittance never exceeds distributable profit or available cash; no negative balances, unexplained money creation, or breakage of the accounting identity, determinism, and M4b close invariants; M5 ownership/enterprise structures are established or explicitly extended rather than assumed. **Implemented and accepted** (§17.2b, D-056). |
| **M5b** | Public debt and deficit financing: versioned debt contracts, issuance with matching asset/liability entries and actual cash transfers, daily interest accrual, monthly coupons, maturity/principal repayment, refinancing, explicit arrears, and default; deficit financing limited by creditor cash and an outstanding-principal ceiling (§5.4.6, §17.3, D-057) | Fiscal deficit, financing transactions, borrowing proceeds, interest expense, and principal repayment are separately and explicitly recorded; every issuance moves existing cash between identified issuer/holder accounts; outstanding liability reconciles; financing constraints and default consequences are defined; no unexplained money creation, invisible unpaid obligation, or premature full banking/central-bank system. |
| **M6** | Deterministic country AI v1, action validation, stress testing, simulation performance report | AI can govern the sample world without invalid actions or hidden-information access; full-campaign benchmark reports p50/p95/p99; no unbounded state growth; performance bottlenecks are identified. **Implemented and accepted** (§17.2d, D-058/D-059). |
| **M7** | Mobile worker proof of concept and playable app: map, snapshot bus, five core screens plus map | Release build runs on iOS and Android; pause/speed/actions/save/load work; UI reads snapshots only; target frame-rate and on-device tick performance are measured and reported. **Implemented at source/web/JS-bundle level; native release builds and on-device measurements are NOT VERIFIED — documented acceptance exception (§17.2e, D-061).** |
| **E0** | Economic Management Design Specification: policy framework, dependencies, authority boundaries, accounting/persistence implications, UI information architecture, testable acceptance criteria, prioritized sequence, and exclusions (§17A) | Design is complete enough that each later E stage has a scoped deliverable, explicit dependencies, implementation-status labels, accounting/timing rules, and testable acceptance. **Documented in this revision; no gameplay behavior.** |
| **E1** | Economic clarity and monthly reports using existing simulation state: national dashboard, causal explanations, pre-commitment explanations, monthly report/action history, focused improvements to the six M7 screens (§17A.12, §17A.17) | A player can identify major economic problems, read definitions/periods for displayed figures, distinguish stocks/flows/nominal/real and reported/forecast values, and see actual effects of existing policies; no unsupported indicators or new major mechanics. **Implemented (§17A.17, D-071).** |
| **M7a** | Annual finance summaries and annual-period boundaries, year-end closing treatment consistent with the M4b monthly close, partial-year handling, and controlled auditable correction/reversal entries (§17.3, §17B) | Annual close is deterministic, atomic, validated, persisted, and reconciled; partial first/last campaign years are defined and the terminal boundary is excluded; corrections are posted as new auditable entries with provenance and never edit or delete closed history; monthly summaries, the accounting identity, and four-flow semantics remain intact. **Implemented (§17B, D-072); schema 18 / simulation 0.18.0.** Not a prerequisite for the M0–M7 playable slice. |
| **E2** | Fiscal management: expanded tax and spending instruments, budget allocation, reserves, borrowing/financing rules, and a public-budget interface (§17A.5, §17.5) | Each implemented instrument has a defined base, calculation, posting path, timing, constraint, player-visible consequence, and test; deficits, borrowing, interest, and repayment remain distinct; unsupported instruments are labelled dependencies rather than decorative controls. **Implemented (§17A.18, D-073); income-tax exemption, welfare eligibility/reserve, business-profit tax, budget decomposition, and player borrowing/repayment/debt-policy actions.** |
| **E3** | Public investment and construction: project queue, real costs/labor/time, financing, progress, completion into actual assets, cancellation/interruption/failure (§17A.6, §17.5) | Projects consume real modeled resources, create actual capabilities represented by definitions, persist deterministically, and have atomic/rollback rules; no instant arbitrary bonuses. **Implemented (§17A.19, D-074); E3 originally scoped money + idle labor + time, with materials/procurement added by E4.** |
| **E4** | Industrial and business policy: validated sector classification, sectoral production subsidy, construction materials/government procurement, public-enterprise capital support (§17A.7, §17A.14, §17A.20) | Every implemented instrument changes actual enterprise behavior, budget flows, production, investment, or material availability and has tests; unimplemented instruments/prerequisites are explicit. **Implemented (§17A.20, D-075); private co-financing, loans, guarantees, investment tax credits, public-enterprise expansion/discontinuation, and price controls remain deferred.** |
| **E4** | Industrial and business policy: selected sectoral subsidies, procurement, investment incentives, and public-enterprise investment supported by the model (§17A.7, §17.5) | Every implemented instrument changes actual enterprise behavior, budget flows, production, or investment and has tests; unimplemented instruments and prerequisites are explicit. |
| **M8** | Institutions, interest groups, laws, elections, unrest, instability, historical-shock/event content. **Implemented (§17C, D-076)** for laws (taxation/suffrage/labor/trade), elections, interest groups, regional unrest, crisis/revolution, administration quality/overload, and scripted events; education (M9) and health (E5) law mechanics are now implemented, while currency/colonial/military-service law mechanics remain later-stage dependencies | Law/election outcomes follow documented prerequisites; a revolution or regime crisis can arise from simulated causes; scripted events are idempotent and have provenance. |
| **M9** | Technology tree, research staffing/work, education and literacy mechanics | Acyclic tree validates; tech progress occurs only from assigned work; unlocking technology measurably and correctly changes the specified systems; literacy outcomes match the test scenarios. **Implemented (§17D, D-077).** |
| **E5a** | Labor/social services and transfers that do not require new labor-law instruments: education/health/training spending, social transfers, migration policy, and time-lagged qualification/welfare effects (§17A.9, §17.5) | Spending and service capacity affect actual qualifications, productivity, employment, and household welfare with documented lags; immediate transfers are distinguished from slow structural effects. **Implemented (§17E, D-078); training stipend is the immediate transfer, qualification gains are the slow channel, and public health is a staffed service.** |
| **E5b** | Labor institutions and legal standards that require M8 laws: minimum wages, hours/standards, collective bargaining, and related enforcement (§17A.9, §17.5) | Laws have model-backed effects and enforcement constraints; unsupported legal mechanisms remain deferred; no decorative law toggles. **Implemented for minimum wage, working hours/standards, and the public-health staff floor (§17E, D-078); collective bargaining and labour-market enforcement remain deferred.** |
| **E6** | Trade and monetary economy: trade prerequisites/flows/tariffs, then monetary foundations and controls; includes the retained M8a monetary-foundation scope as E6b (§17A.8, §17A.10, §17.5) | **E6a implemented (§17F, D-079):** real inter-market trade/transport/customs with balanced postings and a validated policy action; a tariff changes actual landed cost, quantity, and revenue. **E6b** delivers a documented inflation measure, exchange-rate dynamics, monetary authority, balanced money/credit accounting, and tests; neither is claimed until implemented. |
| **M8a** | *(Implemented as the monetary-foundation substage E6b, §17G/D-080.)* Inflation/price-level measurement with an explicit basket, weights, and time window; exchange-rate dynamics built on existing country/currency identities and valuations; defined monetary-policy authority and controls with explicit causal mechanisms and balanced money/credit accounting (§17.3) | Measure, basket, weights, window, timing, bounds, persistence, and tests are documented; policy effects have explicit causal mechanisms rather than arbitrary scalar adjustments; any money-supply or credit change has balanced accounting counterparts; prerequisites not delivered by M8 are recorded rather than hidden; no unrestricted issuance, full banking system, or elaborate capital markets are presumed. |
| **M10** | Diplomacy, treaties, armies, mobilization, combat, casualties, occupation, peace | Two-country conflict resolves end-to-end; casualties and mobilization reconcile with population/workforce; equipment and finance are consumed correctly; peace/territorial changes update all affected systems. **Implemented (v2.17, §17H, D-081):** the two-country conflict, recruitment/mobilization, paid equipment and finance, deterministic casualties with conservation, white-peace/cession, and the sovereignty/control split are covered by `m10-warfare.test.ts`; treaties, alliances, sanctions, recognition, and AI war strategy remain recorded deferrals. |

**Vertical slice:** M0–M7. The slice is complete only when the player can start a scenario, inspect the country/world, change available economic policies, advance/pause time, save/load, and observe deterministic, causally connected consequences on a device. M5a and M5b are finance stages inside this build order; M7a and M8a are post-slice stages (**M8a is retained as the monetary-foundation substage E6b**) and are **not** prerequisites for the initial playable release. E0–E6 and the combined sequence are in §17.5/§17A.

**Economic-management sequence.** The Economic Management Overhaul is inserted into
the build order as `M7 → E0 → E1 → M7a → E2 → E3 → E4 → M8 → M9 → E5 → E6 → M10`,
with M7a recommended after E1 and before E2 when annual fiscal reporting is included.
E0 is complete as documentation and **E1, E2, E3, E4, and M8 are implemented**;
E5–E6 are planned and unimplemented. This insertion does not renumber M0–M10, does
not make E1–E4 depend on M8, and does not delay the existing M0–M7 slice. M8's
political-institutions/laws scope is implemented; M8a is retained as the
monetary-foundation substage E6b, and M9/M10 follow E6. The full stage rules,
dependencies, exclusions, and acceptance criteria are in §17.5 and §17A.

### 17.1 M3 implementation stages (accepted baseline)

M3 remains the overall economy milestone. It was implemented and accepted in six
stages; all six form the current M3 baseline. Detailed test counts, benchmark
hashes, and timings belong in `README.md` and `DECISIONS.md`, not in this design
document.

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M3a** | Validated economy definitions, schema-backed world state, stock/ledger primitives, serialization | Definitions and scenario state validate; typed-array/save round trips; postings balance; invalid references reject; no invented economic behavior. | Accepted |
| **M3b** | Deterministic monthly/dirty employment assignment | No block exceeds eligible workforce; no building exceeds job slots; qualification respected; order-independent deterministic result; dirty/monthly scheduling. | Accepted |
| **M3c** | Production, input reservations, inventory movement, storage overflow | Capacity and staffing constraints; actual inputs only; unused reservations released; goods conservation; recorded overflow; no wages/prices/settlement. | Accepted |
| **M3d** | Two-pass market clearing, priority tiers, seller-attributed transactions, bounded prices | Order-independent scarcity allocation; household/tier blocking; critical-input classification; stock conservation; provisional bounded price update; no cash mutation. | Accepted |
| **M3e** | Cash settlement of market purchases, wages, upkeep, retained profit | Atomic funded market batch; same-batch sales receipts; no negative buyer; pro-rata wage/upkeep shortfalls without debt; cash-basis profit retained; exact posting reconciliation. | Accepted |
| **M3f** | Integrated daily economic tick, real-state demand, whole-day atomicity, monthly wealth convention | M2-only path preserved; household demand cash-safe; production full-demand attempt plus conservative fallback; M3d/M3e sequence; needs/militancy/monthly wealth; structural staging publishes only after full success; deterministic/save/rollback coverage. | Accepted |

The accepted M3f revision records the monthly-wealth income convention in §6.5 and
D-042. It does not implement a trailing-month income accumulator. M4a-1, M4a-2,
M4b, and M4c are accepted stages (§17.2); the remaining M4 finance work is not
started, and the adopted intermediate stages in §17.3 are planned, not
implemented.

### 17.2 M4 implementation stages (accepted foundation)

M4 is staged. M4a-1, M4a-2, M4b, and M4c are accepted. The remaining
corporate/consumption/land/tariff tax and broader non-debt government-expenditure
work is not implemented. v2.6's Economic Management Overhaul assigns specific
extensions to E2 (fiscal instruments/spending), E4 (industrial/business policy), and
E6a (customs/trade), but it does not silently absorb every historical M4 aspiration;
each instrument still requires its own mechanics and acceptance (§17A). It does not
reopen the accepted M4 stages.
M5a profit distributions/state-enterprise remittances and M5b debt/interest/
maturity are implemented and accepted (§17.2b/§17.2c). Annual close and controlled
corrections and inflation/FX/monetary-policy work remain planned in §17.3 (M7a and
M8a respectively) and are not implemented; M8a is retained as E6b in §17A.

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M4a-1** | Category-aware double-entry accounts, normal-side balances, opening balances, recognition legs | Account categories/subtypes validate; opening balances apply once with provenance; postings balance and the accounting identity holds; M3 cash outcomes and producer/household settlement totals are unchanged; serialization, determinism, and rollback tests pass. | Accepted |
| **M4a-2** | Country/currency identity, monetary arrangements, RUSD-relative valuation, country-region ownership | Runtime `countries`/`currencies`/`currencyValuations` validate, serialize, hash, and clone; `own`/`adopted` rules validate; foreign adoption and one-issued-currency restrictions are enforced; region ownership is authoritative in `Country.regionIds`; conversion direction and unavailable-valuation errors are tested; no M3/M4a-1 economic outcome changes. | Accepted |
| **M4b** | Monthly period close, immutable finance summaries, semantic posting matrix, internal `period-close`, staged-versus-published close boundary | Economic worlds close on civil month-ends after settlement, needs/militancy, and month-end wealth; the first period may be partial and duplicate/gap/terminal cases reject; summaries capture the pre-close trial balance and the four mapped gross flows; revenue/expense opening balances are zero and the semantic matrix is enforced for single, batched, and persisted postings; closing entries zero revenue/expense exactly, close into existing owner equity in deterministic order, remain cash-neutral, and preserve the accounting identity; missing owner equity fails before mutation; the close is atomic and staged; published validation/serialization/hashing/deserialization reject an unadvanced close; summaries and `closedThroughDay` round-trip, clone, hash, and validate; schema-7/simulation-0.7.0 saves are rejected; deterministic and benchmark coverage passes. | Accepted |
| **M4c** | Per-country treasury and fiscal accounts, `Country.fiscal` policy state, daily income tax on actual wages, daily budgeted per-capita welfare transfer with proportional shortfall, fiscal posting kinds and semantic matrix, wealth-input refinement | Country and household fiscal account sets validate; treasury opening cash applies once with provenance and balance-sheet counterparts; fiscal values, treasury references, id collisions, and region-ownership gaps reject before mutation; income tax equals the flat rate on actual received wages and cannot exceed them or household cash; welfare uses the civil year's day count, allocates exactly per capita, and reduces proportionally when treasury cash is insufficient without debt, arrears, or negative cash; fiscal postings are cash-neutral, balanced, structurally require their recognition/cash legs, are semantically validated for single/batched/persisted forms, and close into country equity in deterministic order; the fiscal phase is staged on a finance clone and publishes only after complete staged validation, rejects duplicate/stale/wrong-day/terminal execution before mutation, and leaves the original state unchanged on a post-posting failure; transient settlement/needs/fiscal cash fields are phase-qualified and `governmentPeriodTotals` derives government totals from a frozen summary; M4b summary shape and four flow kinds are unchanged; M2/M3/M4a/M4b behavior is preserved for zero-fiscal and countryless worlds; schema-9/simulation-0.9.0 round-trip, determinism, save/resume, and benchmark coverage pass; schema-8/0.8.0 saves reject. | Accepted |

M4b did not add taxes or government finance, and M4c adds only the fiscal subset
described in §5.4.3 and §8.3–§8.4. Neither stage adds corporate, consumption,
land, or tariff taxes, broader government services or procurement, debt, interest,
banks, monetary issuance, native-currency balances, FX, inflation, annual close,
reopen/reversal, or UI. Those deferred systems are not silently folded back into
M4: §17.3 assigns the adopted finance subset to planned intermediate stages, §17A
assigns specific fiscal/industrial/trade extensions to E2/E4/E6a, and the remaining
bases/prerequisites stay unassigned future work.

M8–M10 extend the systems after the economic vertical slice is playable. Their
interfaces may be prepared earlier, but do not implement speculative behavior in
the vertical-slice milestones. The planned intermediate stages in §17.3 are
subject to the same rule.

### 17.2a M5 implementation (accepted)

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M5** | Multi-region/multi-country worlds, multiple and shared markets, monthly migration, geographic labor access, initial historical data pipeline, and eight authored sample polities | Eight polities construct, validate, serialize, save/resume, and tick together; ownership/region/market/block/building/employment relationships validate; each market is cleared once with market-scoped inventory and conservation; shared-market goods/demand are not duplicated; migration is an explicit deterministic flow with exact population conservation and account-balanced cash transfers; labor access respects domestic/open-border, qualification, participation, slot, and workforce caps without double counting; the historical validator rejects structural contradictions and checks source/calibration metadata; finance/fiscal, M4b close, M4c fiscal, determinism, save/resume, and existing M2/M3/M4 regressions pass; schema 10/simulation 0.10.0 round-trips and schema-9/0.9.0 saves reject; benchmark coverage includes a multi-country campaign and stress fixture. | Accepted |

M5 implements §5.4.4 and D-051–D-055. M5 itself does **not** implement M5a profit
distribution/remittances (added by §17.2b), M5b debt/deficit financing,
inter-market physical trade, tariffs, a rest-of-world trade account, profession
promotion/demotion, education, technology, laws, AI, or UI. The M5 historical
sample is provisional: population totals are rounded source-referenced estimates,
occupation composition is a provisional household proxy, and century-scale
historical population/occupation-trend calibration is not claimed. The benchmark
reports a measured multi-country sample and projects, rather than executes, a full
36,524-tick economic campaign; mobile performance remains **NOT EVALUATED**.

### 17.2b M5a implementation (accepted)

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M5a** | Persisted profit-allocation policy, retained-profit accounts, designated private/state enterprise ownership, post-close month-end profit reclassification, private distributions, and state-enterprise remittances | Policy, ownership, timing, profit measure, account semantics, and cash caps are explicit and deterministic; every distribution/remittance is backed by positive retained profit and actual operating cash; no negative cash, money creation, liability, or deferred obligation; M4b close semantics/four flows and M4c fiscal behavior are unchanged; accounting identity, cash conservation, determinism, save/resume, and atomic staging pass; schema 11/simulation 0.11.0 round-trips and schema-10/0.10.0 saves reject; focused and benchmark coverage pass. | Accepted |

M5a implements §5.4.5 and D-056. It does **not** add corporate/dividend/capital-gains
tax, securities markets, share issuance/trading, banking, debt, deficit financing,
arbitrary player/AI distribution controls, or M5b behavior. The shipped M5
historical campaign enables the private/state allocation policy; legacy M0–M5
fixtures default it off and retain their accepted behavior.

### 17.2c M5b implementation (accepted)

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M5b** | Persisted country debt policy and versioned debt contracts, identified country/household creditors, cash-neutral issuance/principal postings, daily interest accrual, monthly coupons, maturity/repayment, refinancing, explicit arrears/default write-down, and month-end deficit financing within creditor-cash and ceiling constraints | Fiscal deficit, financing, borrowing proceeds, interest expense, and principal repayment are separately recorded; every issuance moves existing cash between identified issuer/holder accounts; outstanding liability reconciles; interest/principal/maturity/default rules and financing constraints are explicit and deterministic; accounting identity, cash conservation, M4b four flows, M4c fiscal behavior, M5a behavior when disabled, save/resume, atomic staging, and schema/version rejection pass; focused and benchmark coverage pass. | Accepted |

M5b implements §5.4.6, §8.5, and D-057. It does **not** add commercial banking,
deposit money, a central bank, monetary issuance, bond-market pricing/auctions,
derivatives, external investor pools, debt-to-GDP targeting, interest taxation, or
player/AI debt actions. Legacy M0–M5a fixtures default the country debt policy off
and retain their accepted account sets, behavior, and digests except for the
intentional schema/state-version rebaseline.

### 17.2d M6 implementation (accepted)

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M6** | Deterministic rule-based country AI v1, persisted schedule/goal state, own-country/public observation boundary, shared player/AI fiscal-policy action validation, historical-sample governance, AI stress fixture, and opt-in full-campaign performance report | Every sample country evaluates on its staggered seven-day schedule; the AI uses only own-country/public observation and is deterministic for a given state and day; invalid player actions are rejected without mutation; AI proposals use the same validator and produce zero rejected proposals in the sample campaign; fiscal actions never create money, debt, negative cash, or a hidden obligation; AI state, actions, diagnostics, replay, save/resume, and schema-13/simulation-0.13.0 round-trips pass; schema-12/0.12.0 saves reject; full-campaign p50/p95/p99, bounded state, AI action counts, and bottlenecks are reported; mobile performance remains **NOT EVALUATED**. | Accepted |

M6 implements §12 and D-058. It enables AI for the historical sample and leaves
legacy fixtures disabled. Its only action is `set-fiscal-policy`; construction
queues, infrastructure/production priorities, laws, debt actions, diplomacy, and
military actions are explicit non-goals because their systems do not exist or
remain outside the accepted M5b boundary. M6 adds no new revenue/expense posting
kind, no new money source, and no change to M4b close or M4c fiscal semantics. The
full-campaign benchmark is opt-in (`pnpm run bench:campaign`) and is not part of
the default `pnpm run ci`; the measured save size is reported against the GDD 4
MiB engineering target rather than assumed to meet it. D-059 records the hot-path
summary-validation optimization.

### 17.2e M7 implementation (native/device acceptance exception)

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M7** | Versioned simulation worker protocol, immutable snapshot bus, hidden WebView/Web Worker transports, six-screen Expo/React Native shell, player fiscal action, pause/step/speed, compressed save/load, and web/JS bundle verification | Web/headless interaction path passes: start/pause/step, shared-validator fiscal action, gzip save/load restoring the saved day and policy, month-end ledger rendering, zero page errors. UI imports only worker protocol/snapshot contracts and reads no live world. **Native iOS/Android release builds, real-device frame rate, cold start, memory, battery, and on-device tick p95 are NOT VERIFIED.** The production 500-region map/pan-zoom and broad charts are not implemented. | Implemented with documented acceptance exception |

M7 implements §13, §14.2–§14.5, and D-060/D-061. The worker protocol is version 2
after Batch 2 (D-064);
the app receives bounded immutable snapshots and sends commands only through
`@century/sim-worker`. Web uses a Blob-backed Web Worker; native uses a hidden
`react-native-webview` as a separate JavaScript context; Node `worker_threads` is
the headless proof. The six specified screens exist. The map is a 16-region
authored-sample grid, not the 500-region production map, and pan/zoom is absent.
Save storage gzip-compresses the canonical save string without changing the
canonical format, checksum, hash, or schema.

**Acceptance exception.** A native release build requires Xcode and Android
SDK/tooling that are absent, and no reference device was available. Expo web export
and iOS/Android Hermes JS bundle exports were produced, but they are not release
builds. Node and headless-browser results are not mobile performance evidence. The
mobile p95 ≤ 8 ms target, 60 fps, cold start, peak memory, and battery targets
remain **NOT EVALUATED**. This exception is explicit and must remain visible until
a release build is run on a named device.

**Post-M7 remediation batch 4 (D-066).** Public debt is active for the USA player
country only, with GBR as designated creditor; the other seven polities remain
disabled. Financing uses a month-to-date requested-welfare memo and subtracts
treasury liquidity (including prior state-enterprise remittances), so sufficient
cash prevents unnecessary borrowing while an unpaid welfare budget is not silently
ignored. Unpaid welfare is not a liability and is not retroactively paid. Active
contracts are capped at 64, the latest 32 terminated records are retained, and
older terminated detail is compacted into exact per-issuer aggregates. Schema is 16,
sim 0.16.0, data `m3-economy-v3`; older saves are rejected. Default/arrears,
refinancing, coupon, maturity, cash conservation, and bounded-history tests pass;
the full campaign was not rerun and native device behavior remains unverified.

**Post-M7 remediation batch 3 (D-065).** Canonical save history now retains 12
detailed monthly trial balances and compact exact per-country fiscal/flow totals
for older months; the 1,200-period history and dates remain. A representative
1,200-summary fixture falls from 23.25 MiB canonical to 2.04 MiB, below the
4 MiB target, with an equal load hash. Schema is 15 and schema-14 saves are
rejected. Storage uses staged writes with previous/staging recovery; startup offers
Continue/New Game with saved date/version; autosave is 500 ms debounced and limited
to paused/background safe points, with visible failure feedback. Web/native
storage/bridge behavior remains unverified on a device. The full campaign was not
rerun.

**Post-M7 remediation batch 2 (D-064).** The worker now has a bounded pump
backlog, explicit pause/resume/speed/step/load accumulator semantics, target-vs-
achieved speed telemetry, a readiness timeout, command/reply correlation and
timeouts, stale/duplicate reply rejection, a single critical save/load/apply lock,
restart-with-loss-of-unsaved-state recovery, native WebView process-failure hooks,
strict nested snapshot validation, and a contained rendering-error boundary.
Protocol version 2 at M7 completion was incompatible with version 1; the app and
worker are rebuilt together. E1 later bumped the snapshot contract to protocol 3
(§17A.17). Native release/device behavior and on-device pacing remain **NOT
VERIFIED**; no automatic recovery of lost in-memory state is claimed.

**Post-M7 remediation batch 1 (D-062/D-063).** The shipped eight-polity scenario
was re-authored for structural feasibility: it now has a viable fish and livestock
source in every market, a population-scaled per-market building allocation, positive
base-price recipe margins, opening intermediate stock, and opening prices at the
documented lower provisional bound. The USA is the designated player country; the
AI is excluded from its fiscal decisions. These are provisional feasibility
calibrations, not historical calibration. The authoritative state schema is 14 and
the data version was `m3-economy-v2`; older saves are intentionally rejected. Public
debt was disabled in the shipped scenario at that batch; Batch 4 (D-066) later
activates it for the USA player country only. Long-run per-block income
distribution and the missing construction/profession-transition systems remain
uncalibrated.

### 17.3 Intermediate finance stages (M5a/M5b/M7a accepted; M8a planned)

**Status: M5a, M5b, and M7a are implemented and accepted; M8a is planned and not
implemented.** The designer adopted these intermediate stages for financial work
that earlier revisions left unassigned or listed only as later M4 or
later-milestone goals; the staging is recorded as D-050. M5a and M5b are complete
and recorded in §17.2b/D-056 and §17.2c/D-057. The remaining planned stages extend the roadmap, do not
change the accepted M4a/M4b/M4c/M5 design, and must not be described as runtime
support until each is separately implemented, tested, and accepted. The existing
M0–M10 identities are preserved and not renumbered, and the vertical slice
remains M0–M7.

The intended implementation order is:

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

> **v2.6 Economic Management note.** This remains the finance/engineering sequence,
> but the player-facing E program is inserted as specified in §17.5/§17.4:
> `M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4 → M8 → M9 → E5 → E6 →
> M10`. M8a keeps its scope and is executed as E6b. No M-stage identity or
> scope is renumbered or reopened.

#### M5a — Profit distributions and enterprise remittances

**Placement:** after M5, before M5b and M6. **Status:** implemented and accepted
(§17.2b, D-056). The original planned scope is retained here as the design record;
the current model is §5.4.5.

**Scope (implemented).**

- Distribute private business profits to designated owners/household capitalists,
  or retain them as business funds, using explicit deterministic rules.
- Transfer actual state-owned enterprise profits to country treasuries through
  balanced journal entries.
- Specify the ownership, timing, account semantics, and available-funds
  constraints for both flows.
- Prevent any distribution or remittance from exceeding distributable profit or
  available cash.
- Preserve the accounting identity, determinism, and the M4b closing invariants.

**Ownership and timing requirements.** Each flow must name the profit measure, the
accounting period it belongs to, the distributing entity, the recipient account
or owner, and the posting day. A distribution or remittance is a transfer of
already-recognized profit and cash, not a new expense, revenue, or money creation.
Retained profit must remain distinguishable from newly earned profit and from
owner capital. The stage must state whether a shortfall is retained, deferred, or
unpaid, and must not create negative cash, an implicit liability, or an
unrecorded obligation.

**Dependencies and assumptions.** M5a depends on the multi-country economic and
historical-data foundation established by M5 and on the ownership and enterprise
structures M5 actually delivers. If M5 does not establish designated private
business owners/capitalists, state-enterprise ownership, or an explicit enterprise
profit measure, M5a must add those structures explicitly as part of its own scope.
It must not silently assume that missing structures already exist.

**Non-goals.** M5a does not add corporate income tax, dividend tax, capital gains,
securities markets, share issuance or trading, banking, debt, or arbitrary
player/AI distribution controls. It does not change the four M4b flow kinds or the
monthly close semantics; any new distribution/remittance posting kind and its
semantic-matrix entry are added explicitly with the stage.

#### M5b — Public debt and deficit financing

**Placement:** after M5a, before M6. **Status:** implemented and accepted
(§17.2c, D-057).

**Scope (implemented).**

- Versioned debt contracts carrying issuer, holder, principal, interest/coupon
  terms, issue date, maturity, outstanding liability, and status.
- Debt issuance with matching asset/liability accounting and actual cash
  transfers.
- Interest accrual and payment, maturity, principal repayment, refinancing,
  arrears, and explicitly defined default behavior.
- A clear separation between the fiscal deficit, financing transactions,
  borrowing proceeds, interest expense, and principal repayment.
- Explicit financing constraints; no unexplained money creation and no invisible
  unpaid obligations.
- Support for the defined issuers and holders without prematurely implementing a
  full banking or central-bank system.

**Accounting distinction.** The fiscal deficit is an accrued revenue-minus-
expenditure result for a defined period. Borrowing proceeds are a financing inflow
that increases cash and a liability; they are not revenue. Principal repayment
reduces cash and the liability; it is not ordinary expenditure. Interest expense
accrues as an expense and its payment reduces cash; neither is principal
repayment. Refinancing replaces one contract with another and must show both
sides. Arrears and default must be represented by explicit contract status and,
where applicable, explicit liabilities or write-downs rather than an unrecorded
gap between requested and paid amounts.

**Dependencies and rationale.** M5b follows M5a because a credible debt-capacity
and repayment analysis depends on defined profit distributions, enterprise
remittances, and the ownership/enterprise structures those flows require. M5b
precedes M6 so country AI can operate against a financial environment in which
borrowing constraints, interest, maturities, and default consequences are already
defined. The debt contract is current state in `FinanceState.debtContracts`
(§5.4.6, D-057). M5b holders are limited to another country treasury or a pop-block
household cash account; a bank, central-bank, or external investor pool is not
implied.

**Non-goals.** M5b does not add commercial banking, deposit money, a central bank,
unrestricted monetary issuance, bond markets with market-determined prices,
derivatives, or a full capital market. It does not change M4b monthly summaries or
M4c fiscal behavior.

#### M7a — Annual accounting close and controlled corrections

**Placement:** after M7, before M8. **Status:** implemented (schema 17, simulation
0.17.0; §17B and D-072).

**Implemented scope.**

- Annual finance summaries and explicit annual-period boundaries, appended
  immediately after the 31 December monthly close.
- Year-end closing treatment consistent with M4b: the December monthly close is the
  year-end closing entry, zeroing revenue/expense into existing owner equity; the
  annual summary adds no second closing entry and re-runs no daily tax, welfare, or
  market flow.
- Correct partial-year handling when a campaign starts after 1 January, and no
  annual 2000 period at the terminal boundary.
- Controlled, auditable correction/reversal postings through
  `postFinanceCorrection`, with original-posting provenance and a required reason;
  closed monthly and annual summaries remain immutable.
- Deterministic ordering, atomicity, validation, persistence, bounded history, and
  accounting reconciliation.

**Boundaries and requirements.** Annual periods are explicit and validated: the first
and last campaign years may be partial, each later annual period starts after the
previous 31 December, and the terminal `2000-01-01` boundary is not a processed year.
Annual flows are exact sums of that year's monthly summaries; annual closing balances
are treasury cash, debt principal liability, and interest payable at 31 December. No
account-level annual trial balance is retained. A correction posted in a later period
affects the current open period; prior monthly and annual reports are never rewritten,
and the next annual report records the correction count for that year.

**Placement rationale.** M7a completes the accounting lifecycle after the M0–M7
playable vertical slice. It is **not** a prerequisite for the initial playable
release and must not block M5–M7. M8 follows once annual reporting and corrections
are defined.

**Non-goals.** M7a does not add inflation adjustment, real/nominal restatement,
tax assessment, audit institutions, or a full UI ledger. It does not rewrite M4b
monthly summaries or add new M4b flow kinds. Annual summaries are retained (bounded
to 100 campaign years) but only the latest 12 are exposed in the snapshot.

#### M8a — Inflation, FX dynamics, and monetary-policy foundations

**Placement:** retained as **E6b** inside the Economic Management E6 stage, after E6a trade, E5 labor/social, M8, and M9. (The prior plan placed M8a after M8 and before M9; the retained scope and prerequisites are unchanged—see §17.5/§17A.10.) **Status (v2.16): implemented as E6b (§17G, D-080)** for the inflation measure, exchange-rate valuation and managed rule, reserve-backed monetary authority, balanced money accounting, and reserve-cover convertibility. Bank credit, deposits, and a policy interest rate remain recorded missing prerequisites.

**Planned scope.**

- A documented inflation/price-level measure with an explicit basket, weights, and
  time window.
- Exchange-rate dynamics building on the multi-country economy and the existing
  currency identities and valuations.
- A defined monetary-policy authority and policy controls, using the institutions
  and laws established by M8 where applicable.
- Explicit causal mechanisms linking policy to the relevant economic or monetary
  outcomes.
- Balanced accounting for any money-supply or credit changes that are introduced.
- Deterministic timing, bounds, persistence, validation, and tests.

**Measurement and mechanism requirements.** The inflation measure must name the
basket, base period, weights, price sources, refresh cadence, and treatment of
missing or new goods; it is a derived index, not a spendable value or an arbitrary
scalar. Exchange-rate dynamics must build on `CurrencyValuation` and the existing
country/currency identities; `rusdPerUnit` remains a valuation input, not by
itself a peg. Monetary-policy authority must be an institution- or law-backed
actor with explicit instruments, timing, bounds, and transmission channels. Any
change in money supply, credit, or central-bank balance sheet must have balanced
counterpart entries and a defined source or use. A policy must not be simulated
as a direct arbitrary adjustment to inflation, output, or the exchange rate.

**Dependencies and missing prerequisites.** M8a follows M8 because monetary
authority and policy controls depend on political institutions and laws; it
follows M5/M5a/M5b because multi-country trade, enterprise finance, and debt
provide the transmission channels and balance-sheet counterparts. If a meaningful
monetary-policy mechanism requires a prerequisite that M8 and the earlier stages
do not deliver (for example a defined banking/deposit system, a monetary
aggregate, or a securities market), the stage must record that prerequisite and
either include it explicitly in the accepted scope or leave the mechanism
unimplemented. It must not hide the prerequisite inside M8a or approximate it with
an arbitrary scalar.

**Non-goals.** M8a does not presume a fully functioning banking system,
unrestricted monetary issuance, elaborate capital markets, every local-currency
denomination, or a complete payment system. Those remain future or explicit stage
scope. It does not reopen M4a-2 valuation rules or M4c fiscal rules.

> **v2.6 retention and scheduling.** M8a's planned scope above is retained unchanged
> and is the monetary-foundation substage **E6b** of the Economic Management Overhaul
> (§17A.10). It is scheduled after E6a trade, E5 labor/social, M8, and M9 so the
> required real trade, institutional, human-capital, and credit/currency
> prerequisites exist. This is a planning-order change recorded in D-070, not an
> implementation or a reduction of M8a's requirements.

### 17.4 Dependency plan and slice boundary

The finance/engineering order for the pre-overhaul stages remains binding for
planning, not an authorization to implement several stages at once:

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

The player-facing E program is inserted deliberately; the **combined planning order**
is:

`M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4 → M8 → M9 → E5 → E6 → M10`

- M4c supplies the initial treasury, income-tax, and welfare-transfer behavior.
- M5 (accepted) supplies the multi-country economic, migration, labor-mobility,
  and historical-data foundation. Its multi-market/ownership structures are the
  starting point for later enterprise and finance work.
- M5a (accepted) establishes defined private profit distributions, retained-profit
  accounting, state-enterprise ownership, and state-enterprise remittances on the
  ownership structures M5 delivers.
- M5b establishes public debt and deficit-financing behavior before the AI
  milestone.
- M6 (accepted) delivers deterministic country AI v1 and shared action validation.
- M7 (implemented; native/device acceptance exception) delivers the worker
  protocol, snapshot bus, and playable six-screen shell. Real-device release
  verification remains outstanding.
- M7 and the preceding systems together form the intended playable mobile vertical
  slice; the slice is not claimed complete until a release build runs on both
  platforms and on-device performance is measured.
- E0 documents the economic-management design (this revision); E1–E4 add economic
  clarity/reports, fiscal management, public investment/construction, and industrial
  policy on the existing M7/fiscal/enterprise foundation before M8.
- M7a completes annual accounting after the first playable slice and before E2 when
  annual fiscal reporting is included.
- M8 establishes political institutions and laws; M9 establishes technology and
  education/literacy mechanics.
- E5 then adds labor/social institutions and services on those laws and human-capital
  mechanics. E6a adds real trade/commercial policy; E6b retains M8a's monetary
  foundation scope. M10 retains diplomacy/war.
- M8a is not deleted or renumbered: it remains the planned monetary-foundation stage
  with unchanged scope and is scheduled as E6b.

The **vertical slice remains M0–M7**. M7a is now implemented; M8a is a post-slice
stage and not a prerequisite for the initial playable release. M5–M7 are not
automatically blocked on the later monetary systems; M8a may be deferred or narrowed
if its prerequisites are not met, provided the gap is recorded. M5a, M5b, M6, and
M7a are current; M7 is implemented with the native/device acceptance exception above;
M8a is planned and not implemented; no M8a runtime behavior, save field, schema
version, or benchmark gate may be inferred from this plan.

**v2.6 Economic Management insertion.** The Economic Management Overhaul refines the
post-M7 sequence to `M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4 → M8 →
M9 → E5 → E6 → M10`, with E6a trade and E6b monetary foundations. This inserts the
player-facing economic stages before M8/M9, keeps M7a as an independent accounting
stage (now implemented), and retains M8a's scope as E6b after the political,
human-capital, and trade prerequisites. It does not renumber or reopen M0–M10, does
not change the accepted M0–M7 baseline, and does not make any later E stage
implemented. The stage details, exclusions, and acceptance criteria are in §17.5 and
§17A; the material ordering decision is recorded in D-070. E2 was implemented after
M7a as the next stage in this sequence (§17A.18, D-073).

### 17.5 Economic Management Overhaul roadmap (E0–E6)

**Status:** **E0 (design), E1 (Economic Clarity and Monthly Reports), E2 (Fiscal
Management), E3 (Public Investment and Construction), E4 (Industrial and Business
Policy), M7a (Annual Accounting), and M8 (Laws and Institutions) are implemented;
E5–E6 and M8a are planned and not implemented.** E1 is
presentation/selector work; E2 adds the implemented fiscal instruments, budget state,
and validated financing actions; E3 adds the public-construction project queue,
idle-labor capitalization, completion into state-owned productive buildings, and
construction reporting/UI; M7a adds annual summaries and controlled corrections;
M8 adds regimes, laws, elections, interest groups, unrest/crisis, administration,
and scripted events. Their implementation records are §17A.17/§17A.18/§17A.19/
§17A.20/§17B/§17C and D-071/D-072/D-073/D-074/D-075/D-076. Detailed specifications
are in **§17A** and §9; each stage below links to its policy/interface sections and
records its dependencies and exclusions.

#### 17.5.1 Combined implementation order

The existing engineering sequence is preserved where it remains valid. The
player-facing economic program is inserted deliberately between M7 and the later
political/technology milestones, with M7a implemented as an independent accounting
stage:

```
M7 → E0 → E1 → [M7a recommended before E2] → E2 → E3 → E4
   → M8 → M9 → E5 → E6 → M10
```

- **M0–M7** remain the accepted/implemented vertical slice. E0 does not renumber or
  reopen them.
- **M7a** is the implemented annual-accounting stage (§17.3/§17B). It is not an E
  stage and is not required for E1; it is recommended before E2 if E2 exposes annual
  fiscal reporting. It does not block E3–E6.
- **M8** (institutions, interest groups, laws, elections, unrest) is **implemented**
  (§17C, D-076); E5's legal instruments therefore follow an implemented law system.
  E1–E4 do not require M8 because they operate through existing fiscal, enterprise,
  market, construction, and action-validation mechanics. E5's legal instruments
  require M8 and follow it.
- **M9** (technology, research, education/literacy) is **implemented** (§17D,
  D-077). It precedes E5 because education, health-service, qualification, and
  productivity effects need actual human-capital and service mechanisms rather
  than a decorative spending slider.
- **E5** follows M8/M9 and covers labor/social institutions and services.
- **E6** follows E5 and contains **E6a trade/commercial policy** and **E6b monetary
  foundations**. The **M8a** scope is retained unchanged as E6b; M8a is
  renumbered or deleted, only scheduled inside E6 after the political, human-capital,
  and trade prerequisites.
- **M10** (diplomacy/war) follows E6.

This combined order supersedes the prior planned post-M7 ordering
`M7 → M7a → M8 → M8a → M9 → M10` only for the economic program: M7a keeps its place;
M8 and M9 precede E5/E6; M8a is executed as E6b. The M0–M10 identities, accepted
M0–M7 records, and M7a/M8a scopes are unchanged. The conflict and rationale are
recorded in D-070.

#### 17.5.2 Stage summary

| Stage | Purpose | Depends on | Primary deliverables | Explicit exclusions / gates |
|---|---|---|---|---|
| **E0** | Design specification | M0–M7 records; D-048/D-056/D-057/D-063/D-069; this document | Policy framework, dependency map, authority boundaries, accounting/persistence implications, UI information architecture, acceptance criteria, sequence, exclusions | No code, data, schema, UI, or version change. **Complete as documentation.** |
| **E1** | Economic clarity and monthly reports — **implemented** | M7 snapshots; M4b summaries; M4c/M5a/M5b state; existing selectors | Dashboard, five-question navigation, cause explanations, pre-commitment explanations, monthly report/action history, focused screen improvements | No major new mechanics; no unsupported indicators (GDP etc.); bounded report/history; no live-world access. |
| **E2** | Fiscal management — **implemented** | E1; M4c/M5a/M5b; M7a; action validation; finance accounts | Income-tax exemption schedule, welfare eligibility/reserve, business-profit tax, budget allocation/decomposition, player borrowing/repayment/debt-policy actions, pre-commitment and monthly/annual reporting | No new tax base without its real base and collection mechanics; no money creation; no conflation of deficit/debt/principal/interest. Consumption/excise, property/land, customs, education/health/administration/procurement spending remain dependencies. |
| **E3** | Public investment and construction — **implemented** | E2 financing; M3 building/inventory/employment; M5 ownership; market data | Project queue, real labor/time/cost, public financing, deterministic progress, completion into a state-owned productive building, pause/cancel/funding-labor stalls, save/resume, snapshot UI and reporting | No instant bonuses; no infrastructure whose transport/capacity prerequisites do not exist; no free resources; no material procurement in E3 (money + labor + time only per §17A.16). |
| **E4** | Industrial and business policy — **implemented** | E2/E3; M5a ownership/enterprise structures; M3 production; procurement demand/delivery | Validated sector taxonomy; construction material procurement; sectoral production subsidy; public-enterprise capital support; budget/report/UI/actions | No price controls/rationing here (E7 regulation); no sector score without resource/behavior effects; every lever testable. Private co-financing, loans, guarantees, investment tax credits, public-enterprise expansion/discontinuation remain labelled dependencies. |
| **M8** | Political institutions/laws | existing roadmap | Laws, elections, interest groups, unrest, events | Retained existing scope; E5 legal instruments depend on it. |
| **M9** | Technology/education — **implemented** | existing roadmap | Technology tree, research work, education/literacy mechanics | Retained existing scope; E5 human-capital effects depend on it. Military technology effects are deferred to M10. |
| **E5** | Labor and social institutions | E2, E1, M8, M9; population/needs/employment | Services/transfers, training/qualification, health/education effects, pensions/social insurance where supported, labor laws and enforcement | No law or institution without a model mechanism; short-run transfers distinguished from long-run human capital; unsupported pensions/bargaining deferred within stage. |
| **E6a** | Trade and commercial policy | E4, E5, M9; real inter-market trade/transport/customs mechanics; currency transaction support | Trade flows, transport/trade costs, tariffs/customs, import/export rules, agreements, export incentives, protection | **Implemented (v2.15, §17F, D-079):** real flows, transport cost/capacity, customs boundary, tariffs/quotas/export restrictions, and balanced postings. Trade agreements and export incentives remain unexposed dependencies. No tariffs before actual traded flows/customs boundary; no pretending shared markets are international trade; FX implications only once E6b exists. |
| **E6b (M8a)** | Monetary foundations | E6a; M8/M9; banking/credit/inflation prerequisites; existing currency identities | Inflation measure, exchange-rate dynamics, monetary authority/instruments, balanced money/credit accounting | **Implemented (v2.16, §17G, D-080):** documented Laspeyres index, pegged/managed valuation, law-gated reserve-backed authority, balanced currency-board accounting, and reserve-cover convertibility. No unrestricted fiat capabilities; no arbitrary inflation/output/FX adjustment; banking/credit prerequisites recorded rather than hidden. |
| **M10** | Diplomacy/war | existing roadmap plus E6 where trade/currency interacts | Armies, mobilization, combat, occupation, peace | **Implemented (v2.17, §17H, D-081):** armies, recruitment from people, paid equipment/upkeep, deterministic combat and casualties, occupation/liberation, white peace and cession, and the sovereignty/control split. Alliances, sanctions, recognition, tactical combat, and AI war strategy remain unexposed dependencies. |

#### 17.5.3 Authority and status rules

- The player controls **one country** designated by the scenario (`playerCountryId`).
  Other countries are AI-governed. The player's fiscal/economic policy must not be
  silently overwritten by AI decisions; an AI action must not target the player
  country's policy fields.
- Every E-stage deliverable must label each lever as **implemented**, **implemented
  but not exposed**, **partially implemented / needs extension**, **not implemented /
  new mechanics required**, or **deferred**. Design intentions must not be written as
  current functionality.
- No E stage may introduce a decorative control. If the underlying base, expenditure
  path, institution, resource flow, or project mechanism does not exist, the lever is
  a future dependency, not a button.
- E1–E6 must preserve determinism, save compatibility (or an explicit version/migration
  decision), atomic publication, accounting invariants, and the app/worker boundary.
- Native release certification, mobile performance, historical calibration, and other
  engineering acceptance tracks are separate. E stages may be implemented and tested
  in Node/web before native certification; no E stage implies that the M7 device
  exception is closed.

## 17A. Economic Management Overhaul — detailed specification (E0–E6)

**Status:** **E0 design and the E1, E2, E3, and E4 implementations are recorded; E5–E6
are not implemented.** This section is binding design intent for later stages; §5–§8,
§12–§14, and the milestone records remain authoritative for current behavior. Every
lever is labelled with its implementation status and dependency so design intent
cannot be mistaken for current capability. E1's, E2's, E3's, and E4's implementation
evidence, limits, and deferred data dependencies are recorded in §17A.17, §17A.18,
§17A.19, and §17A.20.

### 17A.1 Product goal and core loop

> **Central goal.** Fabric of Nations should be a game in which the player governs a country's
> economy through consequential policy choices, public spending, investment, and
> institution-building. The player must be able to understand the economy's current
> condition, identify important causes, choose interventions, finance those
> interventions, and assess their results.

The economic game is not a dashboard with a few sliders. The player's decisions must
change actual simulation state through explicit, validated, deterministic mechanics.
Every implemented lever must have a defined base, affected agents, posting path,
timing, constraint, and observable consequence.

**Core loop (binding for E1–E6):**

1. **Diagnose.** Read shortages, prices, production, employment, wages, household
   purchasing power, living standards, treasury conditions, debt, and their trends.
2. **Choose a strategy.** Select policies and priorities appropriate to the country's
   problems, institutions, and long-term objectives.
3. **Implement and finance.** Apply validated policies, allocate public resources,
   authorize investment, and manage reserves, borrowing, and repayment within actual
   constraints.
4. **Observe and adapt.** Inspect outcomes over days, months, and years; see what
   changed, why it changed where the model supports the attribution, and revise the
   strategy.

The loop must work at three time scales: daily operational effects (prices, cash,
shortages), monthly fiscal/reporting effects (taxes, spending, debt service, close),
and multi-year structural effects (construction, education, health, productivity,
trade integration, institutions).

### 17A.2 Implementation-truth labels and authority

Every control, indicator, and policy in this section carries one of these labels:

- **Implemented:** present in the current simulation/UI as described elsewhere in
  this document.
- **Implemented, not exposed:** present in simulation state/mechanics but not yet
  controllable or adequately explained in the M7 app.
- **Partial — extension required:** a related mechanism exists, but the full policy
  requires new fields, queries, actions, accounting, or UI.
- **Not implemented — new mechanics required:** no runtime mechanism exists; the
  stated prerequisites must be delivered first.
- **Deferred:** consciously assigned to a later E stage or later milestone.

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

### 17A.3 Design principles

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

### 17A.4 Policy framework overview

| Policy area | Existing foundation | Long-term controls | Governing E stage | Key missing prerequisites |
|---|---|---|---|---|
| **A. Fiscal policy/public finances** | Flat wage income tax; welfare budget/transfer; state-enterprise remittance; treasury cash; public debt/coupon/maturity/default; monthly close | Personal/business/consumption/excise/property/land taxes; customs; administration/education/health/infrastructure/subsidy/procurement spending; reserves; debt limits/priorities/refinancing | E2 (fiscal management); customs in E6a; education/health service delivery in E5 | New tax bases and collection mechanics; expenditure categories and service delivery; procurement demand; budget/reserve policy state; UI actions |
| **B. Public investment/construction** | Building definitions, levels, operating cash, production capacity, employment, inventory, ownership; a building has a real construction cost definition | Player project queue; government/public-enterprise/private-supported projects; materials/labor/time; progress/completion; cancellation/failure; infrastructure | E3 | Project state/queue; construction-phase accounting; material/labor requirements; completion rules; infrastructure/transport model |
| **C. Industrial/business policy** | Private/state ownership kinds; retained profit, distributions, remittances; firm production/profit/cash; market prices | Sectoral subsidies; investment incentives; public-enterprise creation/expansion; procurement; priority-sector programs; exceptional price/production controls | E4 (core); price controls in E7 | Subsidy/procurement postings; enterprise investment decisions; sector classification; public-enterprise capital formation |
| **D. Trade/commercial policy** | Shared markets (not international trade); market-scoped inventory/prices; country/currency identity; RUSD valuation placeholders | Tariffs/customs; import/export restrictions; trade agreements/market access; export incentives; protection; imported inputs/consumer goods; FX implications | E6a (after real trade mechanics) | Inter-market goods flows; transport/trade costs; customs boundary; trade postings; currency transaction/FX mechanics |
| **E. Labor/social policy** | Population blocks, literacy/wealth, qualification/participation, employment, wages, needs, welfare; migration/open borders; education/literacy as a state | Minimum wages; hours/standards; bargaining; education/training; health/public services; pensions/social insurance; migration; qualification/productivity/welfare effects | E5 (after M8/M9) | Laws/institutions (M8); education/health service mechanics (M9/E5); qualification channels; pension/institution mechanisms |
| **F. Monetary policy/currency** | RUSD unit; currency identity/issuer/valuation; unavailable/specified valuation; public debt; country treasuries | Monetary regime; policy rates; central-bank lending; bank credit; convertibility; exchange-rate policy; inflation/price-level dynamics | E6b (M8a scope) | Money/credit creation model; banks/monetary institutions; interest-rate channel; inflation measure; FX dynamics; central-bank accounting |
| **G. Regulation/structural reform** | Ownership kinds; private/state enterprises; market allocation/price rules; land is not modeled; privatization/nationalization not modeled | Competition/market regulation; price controls/rationing; land reform; privatization/nationalization; investment restrictions/incentives; historically appropriate institutions | E7 (post-E6 regulation stage) | Market-structure/competition model; legal institutions; land/property system; ownership transfer mechanics; enforcement |

**Framework rules.** A policy area may be *specified* here without being scheduled
for implementation. The E stage in the table is the earliest stage allowed to expose
the control; a lever that requires a missing prerequisite remains unimplemented even
if its stage is reached. E1 must not add new mechanics from this table.

### 17A.5 Fiscal policy and public finances

**Goal.** The government has meaningful, explainable control over revenue, spending,
reserves, and financing. Every instrument names its real base, calculation, posting
path, affected agents, timing, and player-visible consequence.

#### 17A.5.1 Instrument framework

| Instrument | Real base / expenditure path | Calculation and timing | Accounting / agents | Player-visible consequence | Status / dependency |
|---|---|---|---|---|---|
| **Personal income tax** | Wages actually received by resident pop blocks; `incomeTaxAllowanceRUSDPerYear` exempts a pro-rated daily share | E2: `rate × max(0, actual daily wages − allowance / daysInYear)`, daily withholding at the fiscal phase. Rate and exemption are hard-bounded provisional policy, not law-bounded. | Household `income-tax-expense`/cash → country `income-tax-revenue`/treasury. Net cash to treasury; household disposable cash falls. | Net wages, household purchasing power, treasury receipts, distributional incidence (when strata are modeled). | **Implemented (wage-only schedule, provisional).** No other personal-income base exists; M8 remains the law-enactment dependency. |
| **Business-profit tax** | Each building's recognized current-period result (`sales-revenue − input-expense − wage-expense − upkeep-expense`), positive part only, not gross sales | E2: assessed once per civil month-end at `businessProfitTaxRate × max(0, period result)`; losses are not refunded or carried forward for tax. | Building `business-tax-expense`/`operating-cash` → country `business-tax-revenue`/`treasury-cash` through the distinct `business-profit-tax` posting kind. Collection is limited by actual operating cash; the uncollected part is an explicit shortfall. Affects after-tax retained profit, distributions/remittances, and investment capacity. | After-tax profit, distributions/remittances, investment, treasury revenue. | **Implemented (E2, provisional).** The base is the M5a/M4b recognized period result; no sector or deduction system is introduced. |
| **Consumption/excise tax** | Eligible final or excise-good transactions at a defined stage | Rate × taxable transaction amount; collected once at the documented stage, not repeatedly through the chain. | Buyer household/building cash → seller/collecting account → treasury; requires tax-line tagging or a settlement hook. | Consumer price wedge, household real purchasing power, government revenue, demand composition. | **Not implemented.** Depends on transaction tax-stage/tagging rules and posting integration; deferred past E2. |
| **Property tax** | Defined assessed property/land value or rent base | Periodic assessment × rate, with assessment cadence and payment timing. | Owner cash/equity → treasury; requires property registers and valuation. | Owner burden, construction/investment incentives, treasury revenue. | **Not implemented.** Requires property/land ownership and assessment mechanics (E7/land reform; not merely a tax slider). |
| **Land tax** | Defined land value/rent and agricultural property base | Periodic assessment × rate; collection efficiency may depend on administration. | Landowner/household cash → treasury; requires land tenure model. | Rural burden, land use, investment, treasury revenue. | **Deferred** until a land/property system exists (E7 or an explicitly scoped E2 extension). |
| **Customs duties** | Imports crossing a defined customs boundary, by good/origin | Tariff schedule × dutiable value at the customs event. | Importer cash → customs/treasury; requires trade and customs transactions. | Import prices, input availability, protection, revenue, retaliation. | **Implemented (E6a, D-079).** Ad-valorem duty on each shipment between different customs administrations; shipper cash → destination treasury; retaliation requires an agreement/partner interface that does not exist. |
| **Welfare/household transfers** | Eligible blocks: positive population at or below `welfareMaxWealthLevel`; policy budget | E2: annual welfare budget / civil-year days, proportional allocation across eligible population, exact remainder; payable is limited by treasury cash above `reserveTargetRUSD` and a shortfall is explicit. | Country treasury → household cash; welfare-expense/welfare-income recognition; no debt, receivable, or negative cash. | Household cash, needs fulfillment, poverty/living standards, treasury cost. | **Implemented (single budgeted targeted transfer, provisional).** E5 may add eligibility/categorical rules and service delivery; shortfall semantics must be preserved. |
| **Public administration** | Staffed government offices/functions (not a generic capacity pool) | Operating cost per function/staff/day or month; paid from treasury. | Treasury → wages/supplies; government employment and service output. | Administrative service quality, collection/enforcement, treasury cost. | **Not implemented.** Requires government employment/service production; E2/E5. |
| **Education spending** | Schools/teachers/students and defined service outputs | Operating + investment budget; service capacity changes slowly. | Treasury → education providers/wages; human-capital/qualification effects with lags. | Literacy, qualifications, productivity, wages, long-run growth. | **Not implemented.** Requires M9 education/literacy delivery plus E5 service mechanics. |
| **Healthcare spending** | Health facilities/staff/service outputs | Operating + investment budget; health outcomes with lags. | Treasury → providers/wages; health/mortality/productivity effects. | Mortality/morbidity, workforce, productivity, welfare. | **Not implemented.** Requires a health-service/population-health model; E5 (not a pure cash transfer). |
| **Infrastructure/public investment budgets** | Actual projects/assets (roads, ports, utilities, warehouses, etc.) | Project costs, materials, labor, time; budget authorization and payment schedule. | Treasury/enterprise cash → construction inputs/assets; project capitalization. | Capacity, transport/trade access, productivity, maintenance cost. | **Not implemented.** E6a now supplies the transport/access/capacity model that infrastructure would feed, so transport-dependent infrastructure is a credible adjacent extension; building/maintaining it remains outside E3 and E6a acceptance. |
| **Industrial subsidies** | Eligible enterprises/sectors and a defined activity/input/output base | Subsidy rate/amount per eligible unit/activity, paid against verified production/investment. | Treasury → enterprise cash; subsidy expense; affects prices, entry, output. | Sectoral output, costs, profits, budget cost, fiscal trade-off. | **Not implemented.** E4; needs sector classification, eligibility, verification, posting kind. |
| **Government procurement** | Actual goods/services demanded by government | Purchase orders at market prices or defined contract prices; funded by treasury. | Treasury cash → seller; government goods/services; market demand tier. | Prices, demand, supplier revenue, service delivery, budget cost. | **Not implemented.** E4; requires procurement demand (market priority tier 4 is not implemented) and delivery/stock rules. |
| **Treasury reserves/liquidity** | Actual treasury cash and `reserveTargetRUSD` floor | E2: cash balance managed daily; target is liquidity policy, not a spendable pool or pool of money. It rations daily welfare and discretionary principal repayment, never causes borrowing, and never restricts contractual coupon/maturity/arrears payments. | No special posting; the floor changes welfare paid/shortfall and the maximum discretionary repayment. | Cash buffer, shortfall/borrowing risk, ability to absorb shocks. | **Implemented (E2, provisional).** |
| **Public borrowing** | Existing debt contracts, creditor cash, outstanding ceiling, term/coupon | Issuance at defined events (month-end automatic financing and validated player issuance); interest accrues daily; coupons/maturity per contract. | Cash transfer issuer↔holder; debt liability/bond asset; interest expense/payable, not revenue. | Debt, interest, cash, future obligations, creditor exposure. | **Implemented (M5b mechanics + E2 player issuance, provisional).** The creditor, coupon, and term remain scenario/contract inputs; no bond market or auction. |
| **Debt repayment/refinancing** | Outstanding principal, treasury cash, maturity/refinancing policy | Scheduled maturity plus E2 validated early principal repayment; refinancing replaces principal when policy allows it at maturity. | Treasury cash → holder; liability/bond asset reduce; principal repayment ≠ expenditure. | Debt stock, cash, credibility, future interest. | **Implemented (M5b contract rules + E2 repayment and refinancing/ceiling policy).** No manual refinancing of a non-maturing contract; repay and issue are the explicit equivalent. |

#### 17A.5.2 Fiscal rules

- **Borrowing is not revenue; principal repayment is not ordinary expenditure;
  interest is an expense distinct from principal.** The existing M5b accounting and
  the M4b four flow kinds remain binding.
- **No money creation by tax, spending, subsidy, or transfer.** Every payment moves
  existing cash through balanced accounts. Any future monetary issuance is E6b and
  must have an explicit counterpart.
- **Daily vs periodic.** Income tax and welfare are daily fiscal flows; the
  business-profit tax is assessed on the civil month-end. The monthly close captures
  the period and closes revenue/expense into country equity. A period-based tax posts
  before that period's close and is never re-run by the close.
- **Shortfalls are explicit.** An unfunded expenditure request must be reported as an
  unpaid/shortfall amount or a validated financing decision; it must not create
  negative cash or an invisible liability. An uncollected business-tax assessment and
  an unfinanced month-end requirement are likewise explicit memos, not receivables or
  payables.
- **Collection/enforcement** must be derived from administration, literacy, staffing,
  and institutions once those exist. A fixed efficiency is provisional and must be
  labelled.
- **Player controls** must be validated actions with bounds/law constraints and must
  not bypass the shared action validator. The AI must not overwrite the player
  country's policy.
- **Budget presentation** must separate requested, authorized, accrued, paid, unpaid,
  borrowed, and repaid amounts.

#### 17A.5.3 Existing vs new fiscal mechanics

**Implemented by E2:** a wage-income tax with a per-block exemption schedule; a
single budgeted welfare transfer with a wealth-eligibility ceiling and a treasury
reserve floor; a month-end business-profit tax on the recognized building result with
its own expense/revenue accounts and posting kind; a per-period and annual budget
decomposition (requested/paid/shortfall, assessed/collected/uncollected,
borrowed/principal repaid/interest paid/unfinanced); and validated player actions for
the complete fiscal policy, discretionary borrowing, early principal repayment, and
refinancing/ceiling policy. The Budget screen exposes these controls with
pre-commitment estimates and the Ledger shows the confirmed monthly and annual
decomposition. The implementation record is §17A.18; decisions are D-073.

**Existing and usable:** treasury cash; state-enterprise remittance; debt
issuance/interest/coupon/maturity/refinancing/arrears/default; monthly and annual
finance summaries and close.

**Not implemented (dependency-gated):** consumption/excise taxes (transaction
tax-stage/tagging), property/land taxes (property/land registers and valuation),
customs duties (E6a real trade/customs); administration/education/ health/
infrastructure/subsidy/procurement spending (government employment/services, E3/E4/E5);
collection/enforcement mechanics (administration/institutions). These are not
decorative controls and are not exposed as enabled levers.

### 17A.6 Public investment and construction

**Goal.** Construction is the player's affirmative way to change productive capacity.
A project consumes money, labor, time, and required materials; completion creates an
actual building/infrastructure instance whose definition provides the real capacity.
Instant bonuses, free assets, or a "development level" detached from physical
construction are not acceptable substitutes.

#### 17A.6.1 Project model

| Element | Required design | Current status / dependency |
|---|---|---|
| **Project definition** | Stable project type based on a validated building definition (or a separately validated infrastructure definition), with cost, build time, labor/throughput requirement, required goods/materials, and output asset. | **Implemented (E3, D-074) for productive buildings.** Building definitions carry `constructionCostRUSD` and an authored `constructionWorkers` crew cap; the snapshot exposes buildable project types with output capacity. No separate infrastructure definition; materials are deferred. |
| **Owner/financer** | Government, public enterprise, private owner, or a government-supported private project. Funding source and ownership must be explicit. | **Implemented (E3, D-074) for government-financed, state-owned productive buildings.** The treasury pays construction wages and the completed asset is state-owned. Public-enterprise operation/expansion, private co-financing, subsidies, loans, and guarantees remain E4. |
| **Location** | Region/market with valid ownership, land/space rules where required, and infrastructure access. | **Implemented (E3) for country-owned regions with a valid market.** Land/space rules and transport/access are not modeled; infrastructure requiring them remains deferred (E6a). |
| **Resource requirements** | Money (staged), construction labor/workers, required goods/materials, operating cash after completion. | **Implemented (E3) for money, actual idle labor, time, and completion working capital.** No construction bill of materials or government procurement demand; materials are explicitly deferred to E4 under §17A.16. |
| **Time/work** | Build duration or required work derived from project size, labor assigned, material availability, and administration. No wall-clock time. | **Implemented (E3).** Progress is cumulative gross construction payroll, bounded by the authored cost; duration emerges from daily idle-labor hiring and treasury cash, not a fixed timer. |
| **Progress** | Deterministic daily/weekly work application; progress bounded by 0..required; recorded reason for stalls (money, labor, materials, capacity). | **Implemented (E3) for funds and labor stalls.** Projects are processed in ascending id order, hire only unassigned eligible workers, and record `funds` or `labor`; materials/capacity stalls await E4. |
| **Completion** | Allocate a deterministic building instance id, create the asset with level/condition/owner/operating cash, mark operational, and expose new capacity. | **Implemented (E3).** Deterministic `nextBuildingId`, level 1 / condition 1 / operational, state owner, full account set, cash-limited working capital; ordinary employment/production applies from the next processed day. |
| **Cancellation** | Player cancellation rules; already committed money/material/labor treatment; no negative cash; no hidden refunds. | **Implemented (E3).** Spent work-in-progress is written off to country owner equity without a cash refund; unused authorization is simply released. Pause/resume is also available. |
| **Interruption/failure** | Funding lapse, material/labor shortage, owner insolvency, or explicit destruction/closure; progress preserved or lost per documented rule; no vanished obligation. | **Implemented (E3) for funding/labor stalls, pause/resume, and cancellation.** Progress is preserved while waiting; no liability or negative cash is created. Owner insolvency, destruction, and closure policy remain later extensions. |
| **Persistence** | Project queue/progress serialized, versioned, validated; save/load and deterministic replay preserve it. | **Implemented (E3, schema 19).** Project queue, history, `nextProjectId`, and `nextBuildingId` are versioned/validated; old saves reject under the existing policy. |
| **UI** | Project list, cost/financing, requirements, expected duration (as a projection with stated assumptions), progress, blockers, completion/cancellation. | **Implemented (E3).** Construction tab: type/region selection, upfront cost and static duration estimate with assumptions, queue progress, funds/labor blockers, pause/resume/cancel, history, WIP/public-capital, and capital-outlay reporting. |

#### 17A.6.2 Project classes and dependencies

- **Productive building (farm, ranch, fishery, food processing, textile mill,
  workshop, etc.).** Depends on existing building definitions, regional ownership,
  labor/qualification, construction inputs, and finance. **Implemented in E3** for
  definitions with a productive output; warehouse-only capacity is excluded because
  E3 requires a productive output.
- **Public enterprise project.** Same as a building, but state-owned; requires
  public-enterprise capital/ownership and explicit treasury/enterprise financing.
  **E3 implements the government-financed state-owned asset.** E4 adds
  public-enterprise operating/expansion policy, capital programs, and remittance
  choices.
- **Government-supported private project.** Private owner invests with a documented
  subsidy/loan/guarantee; requires E2 fiscal instruments and E4 incentive mechanics.
  **Deferred to E4; not implemented in E3.**
- **Infrastructure (roads, ports, utilities, communications, irrigation).** Requires a
  transport/access/capacity model and, for trade effects, E6a. It is **not** an E3
  entitlement; only infrastructure with a modeled capacity/access effect may be
  built, and its effect must flow through that model.
- **Maintenance/replacement.** Existing buildings have condition and upkeep; an
  investment system may later add explicit replacement projects. Depreciation or
  condition decay must not be invented as a construction shortcut.

#### 17A.6.3 Accounting, atomicity, and determinism

- **Chosen policy (E3, D-074): capitalize work-in-progress, never expense
  construction cost.** Daily gross construction wages debit a country
  `construction-in-progress` asset and credit treasury; households receive the wages
  (cash-neutral). On completion the full spent amount is reclassified from
  `construction-in-progress` to `public-capital`. Cancellation writes the spent
  work-in-progress off to country owner equity. Capital outlay is reported separately
  from welfare/interest expense.
- **Materials are not modeled in E3.** The current data has no construction bill of
  materials and there is no government procurement demand/delivery path. §17A.16
  explicitly permits E3 to start with money + labor + time; material consumption is an
  E4 dependency and is not faked with an abstract input.
- Construction labor is actual **idle** labor: eligible workers not assigned to a
  production building. A project cannot hire a worker already assigned elsewhere, and
  construction workers are paid the block profession base daily wage.
- Project advancement is deterministic from explicit inputs (workers hired, treasury
  cash, wage, cost cap, rules), not a fixed per-tick bonus. Each worker-day adds its
  paid wage to progress; the final payment is clamped so spend equals the authorized
  cost exactly.
- A failed action or phase leaves the world valid: staged finance/buildings/regions are
  published only after validation; no negative cash, no orphan asset, and no hidden
  liability. Pause/cancel/funding-labor stalls preserve a consistent project record.
- The app receives project state through immutable snapshots; construction actions are
  validated worker commands and never mutate the live world.

#### 17A.6.4 Acceptance direction

**Satisfied for E3's scoped subset (money + idle labor + time).** A player can start
a project, see its cost/financing and projected duration with assumptions, observe real
treasury spending, idle-labor hiring and funds/labor stalls, complete it into a
functioning state-owned asset with definition capacity, and pause/cancel it without
corrupting state. Save/load and replay preserve queue/progress. No project creates an
asset without construction. Material consumption, private co-financing, and
infrastructure remain outside this scoped subset.

### 17A.7 Industrial and business policy

**Goal.** Industrial strategy must be a real choice. Supporting steel, machinery,
agriculture, or consumer goods should change actual productive capacity, resource
flows, prices, profits, and employment rather than only a national score.

#### 17A.7.1 Instruments and minimum mechanics

| Instrument | Intended intervention | Base / calculation | Accounting and agents | Timing | Trade-offs and dependencies |
|---|---|---|---|---|---|
| **Sectoral production subsidy** | Reduce unit cost or support output/employment in a defined sector | **Implemented E4:** ad-valorem rate per validated sector on verified daily gross output value at current market price, limited by treasury cash | Treasury → enterprise operating cash; country `subsidy-expense`/`subsidy-revenue`; affects profit/business-tax base | Daily after production/market and before business tax | Fiscal cost; may sustain inefficient firms; unpaid entitlement is an explicit shortfall. |
| **Investment incentive** | Encourage new capacity or upgrades | Percentage/credit against verified investment spending or a defined tax deduction | Treasury/forgone revenue → investor; asset/investment accounting | At project approval/completion | **Not implemented in E4.** Needs private/co-financed projects and a tax-credit/deduction mechanism; deferred rather than faked. |
| **Public-enterprise creation/expansion** | State directly owns/expands productive assets | **E3 creation** via construction; **E4 capital support** to existing state enterprises | Treasury → public-enterprise operating cash/equity; state ownership; support is capital, not expense | Project completion / validated support action | Fiscal risk, soft budgets, governance; **expansion/discontinuation not implemented.** Support does not guarantee inputs or profit. |
| **Government procurement** | Government buys actual goods/services | **E4 construction materials only:** required quantities bought from actual regional market stock at current price; purchase and delivery are atomic | Treasury → seller operating cash/sales revenue; country work-in-progress; market stock decreases | Construction phase, before labor | Fiscal cost, supplier capture, shortages; **general services/goods procurement, open orders, and delivery delays beyond immediate stock purchase are not implemented.** |
| **Industrial-development program** | Prioritize a sector/region/technology with a package of the above | Explicit bundle of subsidies/incentives/procurement, not a score | Same as component instruments | Multi-year | **Not implemented in E4.** No program bundle or arbitrary "development points." |
| **Price/production controls** | Exceptional direct intervention (price ceiling/floor, quota, rationing) | Regulated price/quantity and enforcement; eligibility/allocation rule | Market/price/quantity effects and possible fiscal costs; needs rationing/allocation machinery | At market/transaction event | Shortages, black markets? (only if modeled), misallocation; **E7**, not the default industrial tool. |

#### 17A.7.2 Ownership and accounting

- Private and state ownership must remain distinguishable; a state enterprise has
  explicit capital, operating cash, profit/loss, and remittance/retained-earnings
  rules. The current M5a machinery provides retained profit, distributions, and
  state-enterprise remittances; creation/expansion and explicit public-enterprise
  capital budgets are not implemented.
- A subsidy, procurement payment, or capital contribution is a real budget flow, not
  a discount code or hidden transfer. It must post through accounts and respect
  treasury cash/debt constraints.
- State-enterprise receipts are not tax revenue. Commercial losses must be visible and
  financed explicitly; they must not be silently covered by money creation.
- Privatization/nationalization are ownership transfers (E7), not free asset creation.

#### 17A.7.3 Current status

**Implemented:** private/state ownership kinds; building production/profit/cash;
retained profit, private distribution, state-enterprise remittance; market prices and
allocation. **E4 adds:** validated building-sector classification; construction
material requirements and actual market procurement; ad-valorem sectoral production
subsidies; and public-enterprise capital support. The subsidy and support flow through
balanced accounts, monthly/annual budget decomposition, and the worker/UI action path.

**Not implemented:** investment tax credits/deductions, private co-financing,
government-supported private projects, loans, guarantees, general goods/services
procurement or open orders, public-enterprise expansion/discontinuation, industrial
program bundles, and price/production controls. These are labelled dependencies, not
decorative controls.

### 17A.8 Trade and commercial policy

**Current truth (v2.15).** Fabric of Nations now has **real inter-market trade with a customs
boundary**. Markets remain the source of truth for stock, prices, and settlement;
intra-market pooled allocation is still **shared-market clearing** and is not
relabelled as trade. E6a adds, outside clearing, authored transport routes between
markets, capacity and transit derived from route distance and the M8 regional
infrastructure quality, producer-consignment shipments that leave the origin market's
stock and enter the destination market exactly once after transit, and a customs
boundary at the market level with an explicit customs administration. A tariff is a
charge on an actual dutiable shipment; it is never attached to shared-market
clearing. Before v2.15 (recorded for history): no customs boundary, transport cost,
merchant/rest-of-world account, trade contract, or cross-market goods flow existed.

#### 17A.8.1 Required prerequisites

**Implemented in E6a (D-079).** Each prerequisite is now delivered:

1. **Inter-market goods flows** with explicit origin/destination, quantity, price,
   delivery timing, and inventory movement — `TradeShipment` plus the daily arrivals
   and dispatch phases (§17F.2).
2. **Transport/communications costs and capacity**, including route/access
   constraints and their effect on landed prices and delivery — authored `TradeRoute`
   distance and base capacity, effective capacity scaled by both markets'
   infrastructure, per-unit freight from the good's `transportCostPerUnit`, and
   `ceil(distance)` transit days.
3. **A customs/trade boundary** with a defined dutiable event, origin/destination
   country, and commodity classification — `Market.customsCountryId`, duty at
   dispatch when the origin and destination administrations differ, origin/destination
   country recorded, and the good id as the commodity classification.
4. **Balanced trade postings** (buyer, seller, transport, customs/treasury, and any
   rest-of-world counterparty) with no money or goods creation — `trade-freight` and
   `customs-duty` are cash-neutral and structurally validated; goods are conserved.
5. **Currency/valuation transactions** if prices/currencies differ — not required:
   every price and account is already RUSD. E6b (D-080) keeps trade RUSD-settled and
   confines conversion to the reserve-backed monetary window; there is no double
   conversion.
6. **Trade policy state and validation** — `Country.trade` tariffs, monthly import
   quotas, and export restrictions with one validated `set-trade-policy` action.
7. **A rest-of-world or foreign counterparty** — the real foreign selling building,
   its operating account, and its country, with bilateral origin/destination country
   recorded per shipment. A non-simulated RoW sector would have to own goods and cash
   without a modeled source and is deferred (D-079 §10).

Before any trade control can be exposed (retained as the prerequisite definition):

1. **Inter-market goods flows** with explicit origin/destination, quantity, price,
   delivery timing, and inventory movement.
2. **Transport/communications costs and capacity**, including route/access
   constraints and their effect on landed prices and delivery.
3. **A customs/trade boundary** with a defined dutiable event, origin/destination
   country, and commodity classification.
4. **Balanced trade postings** (buyer, seller, transport, customs/treasury, and any
   rest-of-world counterparty) with no money or goods creation.
5. **Currency/valuation transactions** if prices/currencies differ; RUSD valuation
   alone does not implement FX settlement.
6. **Trade policy state and validation**: tariffs, quotas, agreements, and
   restrictions with time/scope rules, and a player/AI action path.
7. **A rest-of-world or foreign counterparty** for external trade; otherwise
   "imports" have no seller and no external account.

#### 17A.8.2 Instruments and intended effects

| Instrument | Intended effect | Required mechanics | Status / stage |
|---|---|---|---|
| **Tariff/customs duty** | Raise import cost, protect domestic output, collect revenue | Dutiable trade event, commodity/origin classification, tariff schedule, customs postings | **Implemented (E6a, D-079).** Ad-valorem duty by good on each shipment between different customs administrations; shipper pays from enterprise/owner cash; destination treasury receives it. |
| **Import quota/restriction** | Limit imported quantity or eligibility | Trade licensing/quota allocation, enforcement, border event | **Implemented (E6a, D-079).** Monthly physical quota per good per customs administration with a deterministic month-to-date counter. |
| **Export restriction** | Limit exports of a good; domestic availability/price effects | Export licensing/quota, trade event, domestic market link | **Implemented (E6a, D-079).** Per-good prohibition on exports by that country's own buildings. |
| **Export incentive** | Support exporters via explicit transfer/tax treatment | Export verification and payment/forgone revenue; budget/tax mechanics | **Not implemented.** Requires the E4 investment/incentive machinery; real exports now exist, so it is a credible later extension, not a decorative control. |
| **Trade agreement/market access** | Change tariffs/quotas/access by partner and good | Agreement state, partner identity, validation, duration, dispute/exit rules | **Not implemented.** Requires a diplomacy/foreign-relations interface (M8/M10) that does not exist; not faked as a global modifier. |
| **Domestic-industry protection** | Combine tariffs/quota/procurement/subsidy | Actual component instruments, not a protection score | **Partially implemented (E6a).** Tariffs and quotas are the real components; no "protection score" exists. |
| **Imported inputs/consumer goods** | Availability and price effects from real imports | Trade flows, inventories, landed costs, customs | **Implemented (E6a, D-079).** Imported lots enter the destination market, cost freight and duty, and are sold through normal clearing. |
| **FX/currency implications** | Relative-price and settlement effects | Currency transaction, FX rate/valuation, external accounts | **Partially implemented (E6b, D-080).** A reserve-backed currency board issues/redeems currency against RUSD reserves with an external counterparty, revalues valuations, and gates imports on reserve cover. No FX market, external debt, or multi-currency settlement exists. |

#### 17A.8.3 Rules

- A tariff is a tax on an actual dutiable transaction, not a scalar applied to all
  goods or a modifier to a "trade score." E6a charges it once per shipment at dispatch
  on the origin-market cargo value; intra-market pooled clearing is never dutiable.
- Trade policy must state whether it changes prices, quantities, eligibility, or
  revenue, and through which modeled channel. A tariff raises landed cost and reduces
  the shipped quantity and posts real revenue; a quota caps physical quantity; an
  export restriction removes eligibility.
- Protection that creates shortages, higher input costs, retaliation, or fiscal costs
  must let those effects occur through the model; do not clamp them away. E6a does not
  create retaliation or agreement dynamics because the partner interface does not
  exist; the domestic price, quantity, and revenue effects are real.
- Trade agreements require partner identity and a diplomatic/institutional interface;
  do not fake them as permanent global modifiers.
- No trade control may be implemented before its prerequisite gate; E6a is explicitly
  a dependent stage and may be split into transport/trade-core and policy sub-stages.
  E6a delivered the transport/trade core first and exposes only instruments backed by
  that core.

### 17A.9 Labor and social policy

**Goal.** Labor and social policy should change household welfare, workforce
qualifications, employment conditions, and productivity through modeled channels.
Short-run cash transfers and long-run human-capital investments must not be presented
as if they acted on the same time scale.

#### 17A.9.1 Instruments, timing, and prerequisites

| Instrument | Intended intervention | Model channel / timing | Accounting | Status / dependency |
|---|---|---|---|---|
| **Welfare/household transfers** | Support household cash/living standards | Immediate daily/monthly household cash; needs fulfillment in the same/next demand cycle | Treasury → household cash; welfare expense | **Implemented (single budgeted per-capita).** E2/E5 may add eligibility/categories; no debt/negative cash. |
| **Minimum wage** | Set a legal wage floor for covered employment | Statutory annual floor applied to the daily wage obligation; employer pays from actual operating cash; affects household income and employer cost over weeks/months | No direct posting beyond the existing `wages` posting | **Implemented (E5b, D-078).** Employment quantity is not wage-elastic in E5; that limitation is explicit. |
| **Working hours/workplace standards** | Regulate hours/conditions; affect productivity/health | Statutory week scales capacity and daily wages; a bounded mortality improvement; slow population effect | Alters existing wage/operating flows; no magic productivity bonus | **Implemented (E5b, D-078).** Shorter hours reduce output and pay and modestly improve mortality. |
| **Collective bargaining/labor institutions** | Worker organization and negotiated wages/conditions | Institution membership/coverage → wage bargaining, strikes/unrest, productivity; long-run | Wages/transfers as actual flows; no arbitrary "labor power" pool | **Deferred within E5 (D-078).** M8 organisation/influence is aggregate politics, not bargaining coverage; a credible recognition/coverage model is absent. |
| **Education/vocational training** | Build human capital/qualifications | Funded academic instructors × trainees; part-time participation; daily qualification gain; qualification raises wages and labour productivity | Treasury → training payroll and trainee stipend (`training-payroll`, `training-stipend`); cash-limited | **Implemented (E5a, D-078).** M9 education/literacy supplies the academic base and eligibility; no instant qualification or duplicate state. |
| **Healthcare/public health** | Improve health, reduce mortality/morbidity, support productivity | A player-set share of the existing administration clerk base delivers public-health service; derived service output reduces mortality; reduced administration staffing is the trade-off | Existing administration payroll; health share reported as a derived allocation | **Implemented (E5a, D-078) with a documented simplification:** practitioner-level medical staffing is not modeled. |
| **Pensions/social insurance** | Support elderly/eligible groups; contributions/benefits | Eligibility/contribution rules → transfers; long-run fiscal obligation | Treasury/contribution fund → household cash; explicit liability if accrued | **Deferred within E5 (D-078).** No contribution/benefit/liability model exists; not faked as generic welfare. |
| **Migration policy** | Open/restrict immigration/emigration | Existing `Country.immigrationOpen` + migration/labor-access rules; the M8 trade law is the legal path; effects on population/wages/employment | No direct posting beyond migration transfers | **Integrated (E5, D-078).** M5 migration is real and conserved; the M8 trade law exposes the border policy to the player. No duplicate border action. |
| **Labor-market information/enforcement** | Improve matching/compliance | Administrative service → search/placement/enforcement; affects frictions/unemployment | Treasury → administration | **Deferred within E5 (D-078).** Requires a distinct placement/enforcement service, not a relabelled administration share. |

#### 17A.9.2 Time-lag rules

- **Immediate (days):** cash transfers, tax withholding, payroll payments, procurement
  payments.
- **Short run (weeks–months):** wage-floor effects on payroll, hours, prices, and
  employment; migration flows; service utilization.
- **Long run (years):** education/qualification, health outcomes, productivity,
  bargaining institutions, pension entitlements.
- A policy may have both immediate and gradual effects; the UI must state which is
  which and must not promise a long-run outcome from a short-run observation.

#### 17A.9.3 Prerequisites and exclusions

- E5 follows M8 (laws/institutions) and M9 (education/literacy mechanics); E5b legal
  instruments additionally follow M8.
- Unsupported mechanisms (e.g., collective bargaining without organizations,
  healthcare without service capacity, pensions without eligibility/contribution
  rules) remain deferred and must be labelled.
- Minimum-wage/working-hours settings cannot be a free productivity bonus; they must
  act through wages, employment, prices, health/productivity, or other modeled
  channels, including adverse effects where the model supports them.
- Social policy must respect treasury constraints and the fiscal/debt rules; an
  unfunded promise is a shortfall or an explicit future obligation, not invisible.

### 17A.10 Monetary policy and currency

**Status (v2.16): implemented as E6b for the documented monetary foundation (§17G,
D-080).** Current behavior has currency identity, issuer identity, RUSD-relative
valuations, a derived price index, a reserve-backed currency board for own-currency
countries, pegged and law-gated managed exchange-rate regimes, balanced money
accounting, and a reserve-cover convertibility rule with a real import effect. It does
**not** have commercial banks, deposits, bank credit, a policy interest rate, lender of
last resort, external debt, domestic currency-denominated ledgers, or an FX order book;
those remain recorded missing prerequisites rather than faked controls.

#### 17A.10.1 RUSD convention

> **Amended in v2.19 (D-122).** One RUSD has the purchasing power of one
> real-world US dollar of 1990: a constant-purchasing-power reference and
> measurement unit for the simulation. It is not a national currency, legal
> tender, issuer or adoptable currency, and it is not the simulated United States
> dollar. Players see money in their country’s currency (or another chosen
> display currency) converted at display time; display never changes simulation
> state. Authored content is rebased to 1990 dollars in P2 and local display is
> delivered in P3. Where the bullets below say RUSD is "not a promise of constant
> purchasing power", this amendment governs.

- **RUSD is the fixed unit of measurement and accounting denomination.** It is not a
  national legal tender, not necessarily an actual U.S. dollar, and not a promise of
  constant purchasing power.
- Nominal RUSD values are distinct from future real/inflation-adjusted values. Any
  price-level or real-value measure must document its basket, base, weights, and
  window.
- `CurrencyValuation.rusdPerUnit` is a valuation input for a currency; it is not by
  itself a peg, a policy instrument, or a complete exchange-rate model.

#### 17A.10.2 Required institutional and accounting foundations

Before monetary controls can be exposed:

1. **Money and credit creation model** identifying the issuer/institution, the
   balance-sheet counterparts, and the conditions under which money/credit changes.
2. **Banks or monetary institutions** with deposits/loans/capital and explicit
   accounting, if bank credit is modeled.
3. **Interest-rate channel** connecting a policy rate/conditions to lending,
   investment, cash holding, and prices through defined behavior.
4. **Inflation/price-level measure** with a documented basket and weights, derived
   from actual prices, not an arbitrary scalar.
5. **Foreign-exchange model** with rate determination, convertibility rules,
   transaction/settlement use, and external accounts.
6. **Monetary authority** backed by laws/institutions (M8), with explicit instruments,
   timing, bounds, decision authority, and accountability.
7. **Country-appropriate powers**: the model must reflect whether a country issues its
   own currency, adopts another, is on a specie/peg arrangement, or has limited
   monetary capacity. Do not give every country a modern fiat central bank by default.

#### 17A.10.3 Instruments and sequencing

| Lever | Intended mechanism | Prerequisites | Status / stage |
|---|---|---|---|
| **Monetary regime/arrangement** | Define issuer/adoption, convertibility, peg/specie/fiat-like rules | Currency identity; monetary authority; legal/institutional model | **Implemented (E6b, D-080).** Own-currency countries have a reserve-backed authority; adopted/shared currencies have none. The regime is `pegged` by default and `managed` only with an enacted currency law. |
| **Policy interest rate** | Change central-bank lending/deposit conditions → bank credit, investment, cash demand | Central bank + banking/credit model + interest channel | **Not implemented.** Requires a banking/deposit/credit model that does not exist; recorded as a missing prerequisite, not approximated by a slider. |
| **Central-bank lending/credit conditions** | Collateral/term/eligibility rules affecting credit supply | Central-bank balance sheet, banks, eligible assets | **Not implemented.** Same missing banking/credit prerequisite. |
| **Bank credit/availability** | Loan creation and allocation to firms/households | Banking model, capital/regulatory constraints, lending behavior | **Not implemented.** No commercial banks or deposits are modeled. |
| **Currency convertibility** | Rules for exchanging domestic/foreign currency | FX market/settlement, external accounts, legal rules | **Implemented (E6b, D-080).** A currency board issues/redeems currency against RUSD reserves with an external counterparty; reserve cover below the documented minimum suspends convertibility and blocks imports into that customs zone. |
| **Exchange-rate policy** | Peg/manage/float within a documented regime | FX model, reserves, intervention accounting, external accounts | **Implemented (E6b, D-080).** A pegged parity changes only by a bounded policy action with a cooldown and explicit revaluation; a managed rate follows a documented bounded rule from realized trade and relative prices. No arbitrary per-tick setting. |
| **Inflation/price-level dynamics** | Price index derived from actual prices; monetary/real drivers | Basket/weights/window; price formation; money/credit channels | **Implemented as measurement (E6b, D-080).** A Laspeyres index over a fixed needs-derived basket with base 100, bounded month-end observations, and coverage. It has no behavioural effect because the GDD does not specify indexation. |

#### 17A.10.4 Rules

- A policy must not be simulated as a direct arbitrary adjustment to inflation,
  output, or the exchange rate. It must act through defined instruments and channels.
- Any money-supply/credit change needs balanced counterpart entries and an explicit
  source/use. No hidden issuance, no negative-cash financing.
- Exchange-rate policy must respect the country's regime and reserves; convertibility
  restrictions must have real transaction effects.
- Monetary institutions and powers must fit the historical/scenario context; the
  default is not universal modern fiat capacity.
- Missing prerequisites (e.g., no banking model) must be recorded; the mechanism stays
  unimplemented rather than approximated by a slider.
- M8a's prior scope is retained as E6b; this schedule change does not reduce its
  requirements or make it implemented.

### 17A.11 Regulation and structural reform

**Status: specified, not implemented, and not part of the committed E0–E6 sequence.**
These are longer-term systems. They require laws/institutions (M8), ownership and
enterprise mechanisms (M5a/E4), market structure, and in some cases land/property
models that do not exist. They are recorded here so future work does not mistake a
missing mechanism for a ready control. A later regulation stage (provisionally E7)
may implement a subset after E6; it is not authorized by this revision.

| Policy | Intended intervention | Likely trade-offs | Required mechanics before exposure |
|---|---|---|---|
| **Competition/market regulation** | Rules on market structure, entry, pricing behavior, mergers/dominance | Lower rents/markups vs. reduced investment/scale; enforcement cost; possible shortages | Market-structure/competition model; firm conduct; legal institutions; enforcement administration |
| **Price controls/rationing** | Ceilings/floors, quotas, allocation of scarce goods | Shortages, queues, misallocation, suppressed supply, fiscal cost; possible parallel markets only if modeled | Price/quantity regulation, eligibility/allocation, enforcement, market clearing integration; E7 |
| **Land reform** | Redistribute/regulate land tenure/rents | Productivity/investment effects, rural unrest, compensation/fiscal cost, tenure uncertainty | Land/property ownership, assessment, transfer/compensation, agricultural production link |
| **Privatization/nationalization** | Transfer ownership between state and private actors | Price/compensation, investment/governance changes, fiscal proceeds/costs, legitimacy | Ownership transfer mechanics, asset valuation, compensation/financing, legal authority |
| **Investment restrictions/incentives** | Direct/indirect private investment by sector/region/owner | Distortion, capital flight/availability, fiscal cost, growth effects | Capital/investment model, ownership/foreign-investor rules, enforcement |
| **Historically appropriate institutions** | Courts, property rights, business law, colonial/imperial arrangements, etc. | Enforcement/credibility vs. capacity/cost; distributional effects | Institutional model from M8; explicit effects on contracts, taxation, investment, or unrest |

**Rules.** Regulation must operate through actual model rules, not modifiers to a
"business freedom" score. Every intervention must state whether it changes prices,
quantities, ownership, entry, costs, or legal authority. Coercive controls need an
enforcement/capacity model and should produce shortages/misallocation where the model
supports them. Land reform and privatization are ownership transfers, not free asset
creation. Until these mechanics exist, the controls remain unimplemented.

### 17A.12 Understandable economic interface and reports

The M7 six-screen prototype was an inspection shell. E1 evolves it into a system that
answers five questions; the delivered implementation is recorded in §17A.17.

1. **What is happening to my country?**
2. **Why is it happening?**
3. **What can I do about it?**
4. **Can I afford it?**
5. **Did it work?**

The interface must help the player act, not merely read raw statistics.

#### 17A.12.1 National economic dashboard

The dashboard (or an overview plus drill-downs) brings together:

| Group | Required measures | Units/time period / distinction |
|---|---|---|
| **Production** | Output by good and sector; capacity/utilization; production losses | Physical units per day/week/month; stock vs. flow; observed vs. estimated capacity |
| **Supply/demand/inventory** | Supply available, funded/desired demand, shortages/unmet demand, opening/closing stock, storage utilization/overflow | Physical units; daily/monthly; stock vs. flow; shortage definitions stated |
| **Employment/wages** | Assigned workers, vacancies, unemployment where defined, participation/qualification, wages paid/obligations | People, hours/worker-day, RUSD per period; nominal; current vs. period |
| **Household conditions** | Household cash/income, purchasing power, unmet needs by tier, living-standard/wealth indicators | RUSD nominal, real where a defined price index exists; daily/monthly/yearly |
| **Prices** | Prices by good/market, changes/trends, relative price signals | RUSD per physical unit; period change; nominal; observed, not forecast |
| **Fiscal** | Tax revenue by instrument, spending by category, treasury cash, surplus/deficit, unpaid/shortfall | RUSD per day/month/year; flow vs. stock; requested/authorized/accrued/paid |
| **Debt** | Outstanding principal, interest accrued/paid, upcoming coupons/maturities, creditor composition, refinancing | RUSD stock; interest flow; dates; actual vs. projected |
| **Investment** | Projects, cost spent/committed/remaining, progress, blockers, expected completion | RUSD, work/time, resources; actual vs. projection with assumptions |
| **Changes/history** | Month-over-month and year-over-year changes for the above, with comparable periods | Explicit period; nominal vs. real; no implied precision beyond source |

**Definition rules.**

- Every displayed measure has a definition, unit, scope (country/region/market/
  sector), and update period. A value without these is not player-facing.
- **Stocks vs. flows** are labelled (treasury cash/debt/inventory vs. tax
  revenue/spending/production).
- **Nominal vs. real** is labelled; real values require a documented price index and
  are not invented for E1.
- **Reported vs. estimated/forecast** is labelled. Forecasts show assumptions and are
  not presented as exact outcomes.
- **No headline GDP** or similar aggregate is added until §7.8 defines a coherent
  calculation from model flows/stocks. Production, income, expenditure, and other
  components may be shown separately meanwhile.
- The interface must not expose a private simulation variable as a player meter
  without a defined meaning; it must not fabricate precision.

#### 17A.12.2 Explaining causes with actual evidence

The game must explain important problems using evidence the simulation can support:

- Essential-goods shortages because available supply/capacity is below funded demand,
  or because a market cannot obtain inputs.
- High prices because available supply is low relative to funded demand, production is
  constrained, or costs have risen.
- Production losses because output prices are low, inputs are expensive/unavailable,
  wage/upkeep obligations exceed operating cash, or capacity/staffing is insufficient.
- Low household purchasing power because wages/employment are low, prices are high,
  taxes/obligations reduce disposable cash, or needs outrun income.
- Fiscal shortfalls because tax revenue, welfare/other spending, interest, and cash
  are insufficient.
- Investment delays because money, workers, materials, capacity, or authorization is
  missing.

**Attribution rules.** The explanation must identify the supported constraint(s) and
distinguish measured facts from inference. If several causes contribute, list them
rather than inventing a single exact percentage attribution the model cannot compute.
Do not claim causality the simulation does not model. Prefer "available supply was X,
funded demand Y, so unmet Z" over "shortage is 73% caused by policy A."

#### 17A.12.3 Explaining decisions before commitment

Before a policy/project is committed, the interface explains:

- Exactly what the control changes mechanically (field/rule).
- Direct financial cost/benefit, using current actual bases where possible (e.g., a
  tax-rate change against the current taxable base: `Δrate × current base`, labelled
  as an immediate static estimate).
- Affected population, firms, market, region, or institution.
- Important trade-offs and constraints (budget, debt, labor, materials, capacity,
  legal authority).
- When effects are expected to begin and which are immediate vs. lagged.
- Whether the number is an exact calculation, a scenario-dependent projection, or a
  qualitative warning.

**No false precision.** Long-run consumption/production/investment responses may be
projected only from a documented model/elasticity; otherwise present a range or
qualitative trade-off. A static revenue estimate is not a promise of long-run revenue.

#### 17A.12.4 Monthly economic report and action history

Provide a bounded monthly report summarizing:

- Significant changes in production, employment, prices, household conditions,
  treasury, debt, and investment.
- Actual revenues and expenditures by category/instrument, including shortfalls and
  unpaid obligations.
- Player policies and projects initiated/changed during the period.
- Project completions, interruptions, cancellations, and actual costs.
- Explanations of important shortages, deteriorations, improvements, and unresolved
  problems, with links to dashboard evidence.
- Whatever the player can inspect later as a recorded action history.

The report must be derived from authoritative state and bounded history, deterministic,
save-compatible, and suitable for the existing snapshot architecture. It must not
store per-day full-world history; use monthly summaries/aggregates and a bounded
action/event log. Report content must be presentation data, not a second authoritative
economy.

#### 17A.12.5 Screen evolution (E1)

The six M7 screens remain the base and are improved rather than replaced wholesale:

- **Map:** economic overlays (shortage, production, prices, investment) using
  supported data; no invented regional estimates.
- **Country Dashboard:** the five-question overview and drill-downs; headline
  problems and causes.
- **Budget:** actual revenue/expense/treasury/debt and, in E2, policy controls with
  pre-commitment explanations and financing constraints.
- **Population and employment:** needs, purchasing power, wages, unemployment/
  vacancies, qualification constraints, labor-policy links.
- **Markets and prices:** supply/demand/shortages/inventory and price trends; trade
  indicators only after E6a.
- **Ledger/financial summary:** authoritative financial flows, monthly close,
  summaries, and debt; no duplicate ledger.
- **New E3+ surface:** construction/investment projects, either within Country/Budget
  or a dedicated screen after usability testing.

E1 must not add major new simulation mechanics. It uses existing state and improves
the presentation/explanation; controls that require E2–E6 remain labelled future.

### 17A.13 Acceptance criteria

#### 17A.13.1 Overall experience criteria

A completed Economic Management Overhaul must let a new player answer, using the
interface and actual simulation evidence:

1. Why are essential goods scarce or expensive?
2. Why are households poor or unable to satisfy their needs?
3. Why are firms profitable or unprofitable?
4. Why does the government have a surplus, deficit, or debt problem?
5. Which available policies could address the problems?
6. What will each choice cost, what trade-offs should be expected, and how long
   should effects take?
7. After several months, what changed because of the player's decisions?

The player must be able to pursue meaningfully different strategies through actual
mechanics:

- **Industrial development:** construction/public-enterprise/subsidy/procurement
  choices raise industrial capacity, input demand, employment, and output, with
  fiscal/investment trade-offs.
- **Agricultural development and food security:** investment, inputs, storage, and
  policy raise essential-good supply/security, with land/labor/fiscal trade-offs.
- **Export-led growth (after E6a):** trade/transport/customs/currency mechanics make
  external demand and specialization materially different, not a score modifier.
- **Welfare-focused development:** transfers, services, and human-capital spending
  improve household conditions with fiscal/debt and time-lag consequences.

Strategies need not all be implemented in E1; each is assigned to E2–E6 as above. A
strategy is only "meaningfully different" if its model inputs/outcomes differ, not if
only its label differs.

#### 17A.13.2 Per-stage acceptance

| Stage | Testable acceptance (must be demonstrated, not asserted) |
|---|---|
| **E0** | This specification contains the complete instrument list, implementation-status labels, dependencies, authority boundaries, accounting/persistence implications, UI information architecture, E0–E6 sequence, exclusions, and testable acceptance. **Documentation only; no code.** |
| **E1** | A player can: identify a major shortage/price/fiscal problem from the dashboard; trace it to supported supply/demand/cash/price evidence; read the definition/unit/period of every displayed measure; distinguish stock/flow, nominal/real (where defined), and reported/forecast; see the actual effect of an existing policy (e.g., income tax/welfare) in the next month's report; and open a bounded monthly report/action history after a saved run. No unsupported headline indicator is introduced. |
| **E2** | Each implemented tax/spending instrument has a defined base, calculation, posting path, timing, bounds, and UI explanation; a player can change it through a validated action and observe the actual next-period revenue/expense/cash/debt effect; requested vs. paid vs. shortfall and revenue vs. borrowing vs. principal vs. interest are separate; an unaffordable plan is rejected or explicitly unfinanced, never silently money-created. |
| **E3** | A player can queue a project, see money/labor/material requirements and financing, observe real consumption and stall reasons, complete it into an operational asset with the definition's capability, and cancel/interrupt it without invalid state; save/load and deterministic replay preserve the project; no project creates free capacity. |
| **E4** | At least one coherent industrial instrument (e.g., sectoral subsidy or procurement) changes actual enterprise/budget/production/investment behavior and is testable; unsupported instruments are labelled dependencies; no sector score or decorative modifier. |
| **E5** | A supported social/labor policy changes actual household cash, service capacity, qualifications, employment, wages, or productivity through a documented channel and lag; immediate transfers and long-run human-capital effects are distinguishable; laws/institutions require M8; unsupported pension/bargaining mechanisms remain deferred. |
| **E6a** | Real inter-market trade, transport/trade cost, customs boundary, and balanced trade postings exist and are tested before tariffs/quotas/agreements are exposed; a tariff changes actual landed cost/quantity/revenue; shared-market clearing is not relabelled as trade. **Implemented (v2.15, §17F, D-079):** dispatch/arrival/customs/tariff/quota/export-restriction tests in `e6a-trade.test.ts`; duty is posted only for a shipment that actually incurred it. Trade agreements and export incentives remain unexposed dependencies. |
| **E6b (M8a)** | A documented inflation measure, exchange-rate dynamics, monetary authority/instruments, and balanced money/credit accounting exist with tests; policies act through defined channels, not arbitrary adjustments; missing banking/credit prerequisites are explicit; no universal modern fiat powers by default. **Implemented (v2.16, §17G, D-080):** the price index, pegged/managed valuation, currency-board accounting, convertibility/import gate, action, and worker contract are covered by `e6b-monetary.test.ts`; bank credit, deposits, and the policy rate remain explicit missing prerequisites. |

#### 17A.13.3 Usability acceptance tasks

These are concrete tasks, not "the game feels intuitive":

1. **Diagnose a shortage:** starting from a month with an essential-goods shortage,
   the player can identify the affected good/market, compare available supply and
   funded demand, and name at least one supported contributing constraint.
2. **Explain a household problem:** identify a block/region with low needs
   fulfillment and relate it to income, prices, employment, and taxes using displayed
   values.
3. **Explain a fiscal problem:** show treasury cash, actual revenue, actual
   expenditure, interest, and borrowing separately, and state why the deficit arose.
4. **Evaluate a policy:** before committing an available tax/spending change, read
   its mechanical effect, static cost/base estimate, affected agents, constraints,
   and expected timing; after commitment, find the recorded action and its actual
   effect in the monthly report.
5. **Evaluate a project:** before committing a construction project, read its cost,
   materials, labor, time assumptions, and financing; after completion, see the new
   asset and its capacity effect.
6. **Adapt:** after several months, compare a metric's change to the recorded policy/
   project actions and explain at least one supported cause; no exact attribution is
   required where the model cannot support it.

#### 17A.13.4 Non-acceptance criteria

- A control that returns a value but changes no modeled base/flow/institution is not
  acceptable.
- A display that has no definition/period or mixes stock/flow, nominal/real, or
  reported/forecast without labels is not acceptable.
- A construction action that instantly creates capacity without resources is not
  acceptable.
- A tariff or trade policy implemented against shared-market clearing is not
  acceptable.
- A monetary control that directly sets inflation/output/FX without a mechanism is
  not acceptable.
- A report that fabricates exact causal percentages the model cannot compute is not
  acceptable.

### 17A.14 E0–E6 stage specifications

Each stage is a separate assigned task. Do not implement a later stage in an earlier
one. Stages may be split only when the split is recorded and the dependency gates
remain explicit.

#### E0 — Economic Management Design Specification (this revision)

**Status:** documented; no code.

**Deliverables:** the policy framework in §17A.5–§17A.11; authority/AI boundaries in
§17A.2; accounting/persistence implications in §17A.15; UI information architecture in
§17A.12; acceptance criteria in §17A.13; sequence/dependencies/exclusions in §17.5 and
§17A.14; implementation-status labels throughout.

**Acceptance:** every later E stage has a scoped deliverable, explicit prerequisites,
implementation-status labels, exclusions, and testable acceptance. E1–E4 are
implemented; E5–E6 features are not claimed implemented.

#### E1 — Economic Clarity and Monthly Reports

**Status: implemented in this revision.** The implementation record, exact delivered
scope, snapshot additions, and known limitations are in §17A.17 and D-071.

**Scope:** use currently available simulation state to deliver the dashboard, causal
explanations, pre-commitment explanations for existing controls, monthly report/action
history, and focused improvements to the six M7 screens.

**Deliverables:** snapshot/selector fields needed for supported measures; definitions/
units/periods; a national overview with drill-downs; cause panels grounded in actual
state; a bounded monthly report and action history; E1 UI tests/tasks. **Delivered**
(§17A.17).

**Dependencies:** M7 snapshots/protocol; M4b monthly summaries; M4c fiscal state; M5/
M5a/M5b debt and enterprise state; existing selectors. No new tax, construction, trade,
or monetary mechanics.

**Exclusions:** no new tax bases, expenditure categories, construction, subsidies,
trade controls, monetary controls, GDP headline without a definition, per-day full
history, or live-world access. No E2–E6 control may appear as an enabled lever.

**Acceptance:** §17A.13.2 E1 tasks pass; every displayed figure has definition/period;
reported vs. forecast and stock vs. flow are labelled; a player can see the actual
effect of an existing income-tax/welfare policy in a monthly report; save/load and
snapshot determinism preserved; report data bounded. **Accepted by automated/interface
checks and the evidence in §17A.17; no moderated usability study or device test was
run.**

#### E2 — Fiscal Management

**Status: implemented in this revision.** The exact delivered scope, mechanics,
protocol/schema consequences, verification evidence, and remaining limitations are in
§17A.18 and D-073. Priority 1 (income-tax schedule), priority 2's deliverable welfare
parameters, priority 3 (budget/reserve/debt policy), and priority 4 (business-profit
tax) are implemented; priorities 5–6 remain dependency-gated and unimplemented.

**Scope:** expand the existing fiscal model into a meaningful public budget and policy
interface. Implement the tax/spending instruments that have real bases and mechanics;
label the rest as dependencies.

**Priority order (subject to dependency availability):**

1. Extend the existing income-tax control into a law-bounded rate/schedule with clear
   base, incidence, and immediate static-cost explanation.
2. Add public spending categories that can be delivered now: welfare parameters and,
   where E5 service mechanics exist, education/health; administration only with
   government employment/service mechanics.
3. Add budget allocation/reserve targets and player debt/repayment/refinancing policy
   within existing M5b contracts.
4. Add business-profit tax only after a stable taxable profit measure and loss rules.
5. Add consumption/excise only after transaction tax-stage/tagging rules.
6. Customs only in E6a; property/land only after a property/land system.

**Deliverables:** validated policy actions; budget state/interface; tax/spending
posting paths; requested/authorized/accrued/paid/unpaid and revenue/borrowing/
principal/interest separation; pre-commitment and monthly-report support; tests.

**Dependencies:** E1; M4c/M5a/M5b; M7a recommended for annual reporting; existing
action validation and finance accounts. New bases require the prerequisites in
§17A.5.

**Exclusions:** no money creation; no invisible liability; no generic "tax capacity"
pool; no unmodeled tax base; no debt/principal/interest conflation; no AI overwrite of
player policy; no full banking/monetary policy.

**Acceptance:** §17A.13.2 E2 criteria; every implemented instrument has base/
calculation/posting/timing/constraint/test; unaffordable plans reject or report an
explicit unfinanced amount; monthly close/four-flow/accounting identity/determinism/
save compatibility preserved (or a documented version change).

#### E3 — Public Investment and Construction — implemented

**Scope:** introduce the project queue and actual construction. **E3 is implemented**
(§17A.19, D-074) for government-financed state-owned productive buildings using
**money + idle labor + time**. Materials/procurement are deferred to E4 under the
§17A.16 allowance; infrastructure and private-supported projects are excluded.

**Deliverables:** validated project definitions/state; queue; financing/ownership;
money/labor requirements; deterministic progress; completion into real assets;
cancellation/interruption/failure; accounting/capitalization policy; save/resume/
replay; UI/action support; tests. **All delivered for the scoped subset**; material
requirements and procurement are explicitly not delivered.

**Dependencies:** E2 financing; M3 building/inventory/employment/production; M5
ownership; market/price data; project state/schema decision. E4 adds materials,
procurement, subsidies, public-enterprise operation/expansion, and private
co-financing; E6a adds the transport/access/capacity model that transport-dependent
infrastructure would feed (building/maintaining that infrastructure remains a later
extension).

**Exclusions:** no instant bonuses; no free resources; no asset without construction;
no infrastructure whose transport/access model is missing; no arbitrary per-tick
progress without a causal work rule; no construction that bypasses labor. **E3 also
excludes material/input consumption** because no construction BOM/procurement path
exists; that is a documented dependency, not a simulated input.

**Acceptance:** §17A.13.2 E3; projects consume real treasury cash and actual idle
labor, complete into operational assets with definition capacity, pause/cancel/fail
atomically, and preserve determinism/save/load; accounting identity and designated-cash
conservation hold. The implementation evidence is §17A.19.

#### E4 — Industrial and Business Policy — implemented

**Scope:** introduce a coherent subset of industrial-development instruments supported
by the model, prioritized after E2/E3. **E4 is implemented** for: validated sector
classification; construction/commissioning material requirements and actual market
procurement; ad-valorem sectoral production subsidies; and public-enterprise capital
support. General goods/services procurement, private co-financing, loans, guarantees,
investment tax credits, industrial program bundles, and public-enterprise expansion/
discontinuation are **not implemented** and remain labelled dependencies.

**Priority order:** sectoral subsidy on verified output/investment; government
procurement of actual goods/services; public-enterprise capital/expansion; investment
incentives; industrial programs as bundles. Price/production controls are E7, not E4.
**Delivered:** the first instrument, construction-material procurement, and
public-enterprise capital support. Investment incentives/programs remain deferred.

**Dependencies:** E2/E3; M5a ownership/enterprise/profit/remittance; M3 production;
procurement demand/delivery; sector classification and verification. **Delivered** using
the existing market, treasury, building, and M5a paths; no parallel production or
enterprise system is introduced.

**Exclusions:** no sector score, no decorative "industrial policy" modifier, no
subsidy without a base/verification/posting, no public-enterprise asset without E3,
no price controls. **E4 also does not claim** loans, guarantees, private co-financing,
investment tax credits, or expansion/discontinuation.

**Acceptance:** at least one instrument changes actual enterprise behavior/budget/
production/investment and passes tests; all others are labelled; fiscal cost and
trade-offs are visible. **Satisfied by the sectoral subsidy (actual output/base,
treasury payment, enterprise revenue, business-tax integration, shortfall), material
procurement (actual market stock, seller revenue, WIP capitalization, shortage/stall),
and public-enterprise capital support. Evidence is §17A.20.**

#### E5 — Labor and Social Institutions

**Scope:** implement supported labor/social policies with explicit channels and time
lags. E5a covers services/transfers/training/migration; E5b covers legal labor
institutions after M8.

**Deliverables:** service capacity/spending for education/health where M9/E5 supports
it; training/qualification channels; welfare category/eligibility extensions if
specified; migration policy action if supported; minimum-wage/hours/bargaining laws
after M8; pension/social-insurance decision or deferral; tests and UI.

**Dependencies:** E2/E1; M8 (laws/institutions); M9 (education/literacy); population/
needs/employment/qualification state; health/service model where health is claimed.

**Exclusions:** no instant qualification/productivity; no law without a mechanism; no
unsupported pension/bargaining; no social promise without fiscal accounting; no
generic "human capital points."

**Acceptance:** §17A.13.2 E5; at least one immediate transfer and one slow human-
capital/service policy demonstrably act through different channels/lags; legal
instruments require M8 and have enforcement/constraint rules; unsupported mechanisms
are deferred explicitly.

**E5 implementation status (v2.14):** **implemented** for training/qualification,
public health, the training stipend, minimum wage, working hours/standards, and the
public-health staff floor. The training stipend is the immediate transfer; qualification
gains and public health are slow channels. Pensions/social insurance, collective
bargaining, labour-market information/enforcement, cross-profession promotion, and
practitioner-level medical staffing are explicitly deferred under D-078. Evidence and
limitations are §17E.

#### E6 — Trade and Monetary Economy

E6 is deliberately split; it is not one indivisible feature.

**E6a — Trade and commercial policy. Status (v2.15): implemented (§17F, D-079).**
Its prerequisites in §17A.8.1 are delivered: inter-market flows, transport/trade costs
and capacity, a customs boundary, balanced trade postings, and a foreign counterparty.
Tariffs, import quotas, and export restrictions are exposed with real bases and
effects; trade agreements and export incentives remain explicit dependencies. Gates:
E4/E5/M9; E6b for FX-dependent policies. No tariff is attached to shared-market
clearing. The original requirement is retained below as the stage definition.

**E6a requirement (retained).** Implement the prerequisites in §17A.8.1 first:
inter-market flows, transport/trade costs, customs boundary, balanced trade postings,
currency transaction support if needed, and a foreign/rest-of-world counterparty. Only
then expose tariffs/quotas/agreements/export incentives/protection, each with a real
base and effect. Gates: E4/E5/M9; E6b for FX-dependent policies. No tariff on
shared-market clearing.

**E6b — Monetary foundations (retained M8a scope). Status (v2.16): implemented
(§17G, D-080).** The documented inflation measure, exchange-rate valuation and managed
rule, law-gated monetary authority, balanced currency-board accounting, and
reserve-cover convertibility exist with tests. Bank credit, deposits, a policy interest
rate, and lender-of-last-resort are recorded missing prerequisites and are not
approximated. No arbitrary inflation/output/FX setting exists.

**E6b requirement (retained).** Implement §17A.10: money/credit model, banks/monetary
institutions where needed, interest-rate channel, inflation measure, FX dynamics,
monetary authority, balanced accounting, country-appropriate powers. Gates: E6a, M8, M9,
and any missing institutional/credit prerequisites recorded explicitly. No arbitrary
inflation/output/FX setting.

**Acceptance:** §17A.13.2 E6a/E6b; trade policies change actual landed cost/quantity/
revenue; monetary policies act through defined channels and balanced accounts;
missing prerequisites remain explicit; no universal modern fiat state by default.

### 17A.15 Cross-cutting implementation requirements

Any E stage that changes authoritative state must satisfy:

- **Plain, versioned state.** New policy, budget, project, debt, trade, institution,
  and report state is plain data/typed arrays with explicit schema, validation,
  serialization, hashing, cloning, and save/load. No hidden module-level authority.
  Schema/data-version changes follow the existing compatibility policy and are
  explicitly rejected/migrated only when authorized.
- **Atomic actions.** Policy/project actions validate before mutation; multi-entry
  effects post atomically (or stage and publish as the existing day/close patterns).
  Failure leaves authoritative state and published world unchanged.
- **Determinism.** Ordering, tie-breaks, and evaluation cadence are explicit; no wall
  clock, `Math.random`, insertion-order dependence, or UI telemetry may affect
  outcomes. Any stochastic element uses the keyed/counter RNG with purpose/context.
- **Accounting integrity.** Every tax/spending/subsidy/procurement/construction/trade/
  debt/monetary flow has balanced postings and a defined source/use. Borrowing,
  principal, interest, revenue, expense, and transfers remain distinct. The accounting
  identity, designated-cash conservation (except explicitly modeled issuance/
  redemption), monthly close, and four-flow contract remain binding.
- **Player/AI boundary.** Player actions use the shared validated command path; the
  AI uses only its documented observation/action set. The AI must not overwrite the
  player country's policy. New AI capabilities are separate work, not an E-stage
  side effect.
- **Snapshot/report boundary.** UI reads immutable snapshots/selectors only. New
  dashboard/report data is bounded, derived, and safe to drop; no per-day full-world
  history. Snapshot size/rate and responsiveness remain within M7 architecture.
- **Bounded state.** Project queues, action/event history, reports, debt history, and
  any summaries have documented caps/compaction; no unbounded growth over 36,524
  ticks. Compaction must preserve required evidence and accounting.
- **Performance.** E stages must not silently break existing Node thresholds or the
  M7 mobile architecture. New heavy work is measured on bounded fixtures; the mobile
  target remains a separate, device-verified acceptance track.
- **Tests.** Instrument-specific conservation/determinism/save/rollback/UI-contract
  tests; no calibration claim from a model test. Explicitly label provisional
  parameters and structural feasibility vs. historical calibration.
- **Data placement.** Coefficients live in constants/config with units/status;
  scenario/tax/spending/project content lives in validated data where appropriate;
  no hardcoded historical values in generic logic.

### 17A.16 Open design questions and dependency register

These are intentionally unresolved. E0 does not mark them accepted; later stages must
resolve them with a decision record and tests before implementation.

| Question / dependency | Why open | Default until decided |
|---|---|---|
| Construction cost accounting (capitalize vs. expense/work-in-progress) | Affects asset/equity/profit and close; no existing project model | **Resolved by E3/D-074:** daily wages accumulate in country `construction-in-progress`; completion reclassifies to `public-capital`; cancellation writes off to country equity. Construction is capital spending, not welfare/interest expense. |
| Construction materials/inputs | Current `BuildingDef` has a money construction cost; a goods construction bill of materials is not modeled | **Resolved by E4/D-075:** every building definition carries a validated material bill using existing goods; projects buy required quantities from actual regional market stock at the current price, deliver immediately, capitalize the cost in WIP, and wait when stock/cash is insufficient. This is construction/commissioning material procurement, not general services procurement. |
| Infrastructure transport/access model | No roads/ports/route capacity; trade absent | **Resolved by E6a/D-079:** authored market-to-market routes with distance, base capacity, capacity derived from the existing M8 regional infrastructure, per-unit freight, and transit days. *Building* new infrastructure remains an adjacent extension, not an E6a requirement. |
| Land/property ownership and assessment | Land is not modeled | Property/land taxes, land reform, and land-value capture are deferred until a land model exists |
| Trade counterparty/rest-of-world | Shared markets are not international trade | **Resolved by E6a/D-079:** the foreign counterparty is the real foreign selling building, its accounts, and its country, with bilateral origin/destination country per shipment. A non-simulated rest-of-world sector and external accounts are E6b scope and are not faked. |
| Banking/credit/monetary institutions | No banks, deposits, credit creation, or central bank | **Partially resolved by E6b/D-080:** a reserve-backed monetary authority exists for own-currency countries. Commercial banks, deposits, bank credit, a policy interest rate, and lender of last resort remain missing prerequisites and are not faked. |
| Inflation/real-value measure | No defined basket/price index | **Resolved by E6b/D-080:** a documented Laspeyres index over a fixed needs-derived basket, base 100 at the scenario start, bounded month-end observations, country/world measures, and explicit coverage. Measurement only; no indexation. |
| Currency/native-currency balances and FX | No native-currency balances, FX market, or external accounts | **Partially resolved by E6b/D-080:** a currency board holds RUSD reserves, issues currency against them with an external counterparty, and revalues them explicitly. Domestic accounts remain RUSD; no FX order book or external debt. |
| Health/pension/collective-bargaining mechanisms | No service/eligibility/organization models | Defer within E5; do not expose laws without effects |
| Sector classification and eligibility | No sector taxonomy beyond building/good categories | **Resolved by E4/D-075:** `BuildingDef.sector` is a validated enum (agriculture, food-processing, textiles, manufacturing, storage); subsidy eligibility is derived from it, not UI labels. |
| Foreign investment/ownership rules | No foreign-investor/ownership model | Regulation/investment restrictions deferred (E7) |
| Player economic action set beyond fiscal policy | Current action set is only `set-fiscal-policy`; construction/project/industrial/trade/monetary actions do not exist | **E3 adds `start-construction`, `cancel-construction`, `set-construction-paused`; E4 adds `set-industrial-policy` and `support-public-enterprise`; E6a adds `set-trade-policy`.** Each stage adds its own validated action; no generic "policy" action. |
| AI economic behavior beyond fiscal policy | AI has one fiscal action; no construction/trade/monetary AI | E stages may ship player-only controls; AI extension is separate and must not fabricate hidden information |
| GDP/headline aggregate | §7.8 does not define a current calculation | Do not add a GDP headline in E1; define expenditure/output/income measure coherently first |
| Report retention/compaction | Bounded history design not fixed | E1 ships the existing 12-month finance window plus a 48-entry session action history; later stages may extend bounded retention but must not restore oversized account history. |
| Save/schema migration for new state | Each new state may change schema | E stage must follow the data/schema policy; incompatible saves reject or an authorized migration is added. **E3 schema 19 / E4 schema 20 reject older saves; no migration.** |

**CEN-AUDIT-016 sovereignty — resolved by M10/D-081.** Sovereignty is the existing
`Country.regionIds` mapping (legal ownership under the territorial model). Temporary
military control is `Region.controllerCountryId` with `Region.occupiedSinceDay`; a
non-null controller is an occupier that does not own the region. Market membership
(`Region.marketId`), buildings, pop blocks, accounts, treasuries, and monetary
authorities are independent and never change on occupation. Only a validated peace
treaty cedes sovereignty, and only for regions the offering side controls; even then
market membership and private/economic relationships are unchanged. See §11.5 and §17H.

### 17A.17 E1 implementation record

**Status:** implemented on branch `main` in implementation commit
`90160ce2f9b9570034b37f08f44f767502f790cd`, based on the E0 documentation commit
`252cc67d84234782bc7f5fb2abdf640d131a38c1`. E1 is presentation, selector, and
bounded-confirmation work. It does not alter simulation rules, world schema, save
format, data version, hashing, calibration, or the player/AI fiscal-action path.

#### Delivered interface

- **Overview** is the default tab and the primary national dashboard. It states whether
  the selected country is player- or AI-controlled, shows population/working-age/
  employed/hardship/treasury/debt with stock labels, lists evidence-based problems,
  shows estimated production capacity by good, current essential-goods stock/prices/
  capacity, the latest closed fiscal month, and where to investigate next.
- **Country conditions** retain their M7 responsibilities but add player/AI identity,
  household cash, estimated daily wage base, the working-age-not-employed residual
  (explicitly **not** an unemployment rate), and stock/flow caveats.
- **Budget** retains the existing income-tax and welfare controls and adds a
  pre-commitment preview: affected country, current taxable-base estimate, current and
  proposed tax/welfare, daily/monthly static deltas, treasury, latest interest, and
  explicit constraints. The preview is pure and never mutates the snapshot.
- **Markets** adds estimated daily production capacity per good, marks essential goods,
  and distinguishes current stock (balance) from capacity (flow); it states that demand
  and historical prices are not retained.
- **Ledger** adds a monthly economic report (closed-period flows and end-of-close
  balances), recent closes, and confirmed player action history. Older compacted months
  show flows without fabricated balances.
- **Map** identifies the player country and shows a compact current economic summary; it
  remains an inspection surface, not an economic overlay.

#### Data sources and deliberate gaps

E1 uses only immutable snapshot data:

| Measure | Source | Limits |
|---|---|---|
| Population, working age, employed, hardship, unmet-block counts | M2 population blocks and current counters | No unemployment rate, participation rate, or per-capita income is calculated |
| Production capacity by good | M3 buildings, definitions, staffing, level, condition, productivity (`computeBuildingCapacity`) | Estimated capacity, not realized production or demand |
| Market stock, prices, capacity | M3 market lots, `priceRUSD`, building capacity by market region | No historical price/demand series; stock is current inventory |
| Treasury, debt, interest payable | M4/M5 finance index and debt contracts | Closing balances exist only for the retained detailed window |
| Tax, welfare, interest, net result | M4b/frozen monthly close summaries | Flows are closed-period actuals, not forecasts |
| Income-tax base and preview | Current employment × profession base wage ÷ civil-year days | Static current-base estimate, not realized wages or behavior |
| Household cash | Household-cash account balances for the country's blocks | Stock only; not income |
| Need tiers | Authored population need definitions mapped to goods | Static definitions; no per-good unmet history |

Deliberately not displayed: GDP, unemployment, inflation, productivity growth, real
income, forecasts, policy-attribution percentages, or monthly market changes. These need
definitions, retained series, or models that do not exist. E2–E6 mechanics remain absent.

#### Monthly report and balance semantics

The report uses the existing monthly `FinancePeriodSummary` window (at most 12 closes).
`incomeTaxRUSD`, `welfareExpenseRUSD`, `interestExpenseRUSD`, and
`netFiscalResultRUSD` are **flows** for the closed period. `treasuryCashEndRUSD`,
`debtOutstandingEndRUSD`, and `householdCashEndRUSD` are **balances** at close, exposed
only while a summary retains account detail; compacted summaries return `null` and the
UI says "not retained." A balance change is derived only from two detailed closes; no
change is invented across a compacted gap. The current treasury/debt shown on Overview
and Budget is a current stock, not a report flow.

#### Confirmed action history

The provider stages the requested `set-fiscal-policy` values when it sends the existing
`APPLY_ACTION`. It appends a record only on the authoritative `ACTION_RESULT`, using
`event.accepted`, the confirmed snapshot's date/country/fiscal values, and the worker's
`errors`. A rejected action is recorded as rejected with `applied: null`; it is never
reported as applied. History is bounded to 48 entries, session-only, cleared on load or
worker restart, and never persisted into the world, save, hash, or schema. This is the
least invasive design satisfying E1; persistence is deferred until later stages need
cross-session accountability.

#### Protocol and state consequences

- Worker protocol is **3** because the immutable snapshot gained required presentation
  fields: production capacity, need tiers, market capacity, household cash/wage base/
  debt-interest payable, close balances/labels, and `CountrySnapshot.productionCapacityByGood`.
  Command/event shapes and the validated `set-fiscal-policy` action are unchanged.
- No authoritative state, schema, serializer, save, hash, data version, or simulation
  version changed. The new snapshot fields are derived from existing world/definitions/
  finance state at snapshot-build time.
- Snapshot arrays/objects remain frozen; report/action selectors operate only on the
  snapshot and are deterministic. Action history lives in React state, not the world.
- Existing save compaction, replace-safe storage, autosave, worker supervisor, and
  action confirmation remain intact.

#### Verification and acceptance evidence

Tests in `packages/tests/src/e1-economic-clarity.test.ts` cover the new snapshot
contract/protocol validation, need/production/wage fields, monthly flow-versus-balance
separation, compacted-summary no-fabrication, current-base fiscal preview arithmetic,
evidence/caveat explanations, bounded action history, and a rejected action remaining
rejected. `e1-ui-wiring.test.ts` checks the Overview default, screen wiring, preview/report/
action-history surfaces, and absence of forbidden headline claims. Full command results
are recorded in the E1 change report; typecheck, focused tests, full tests,
`check:worker`, and app export passed. The standard `pnpm run ci` test stages passed but
the provisional M2 200-block p95 gate missed at 5.073 ms; a separately run high-priority/
affinity benchmark passed at 4.571 ms. E1 changes no simulation or benchmark code, and
the M2 hash is unchanged; native/device performance remains unevaluated.

#### Remaining E1 limitations

- Market/production/employment history is not retained, so the monthly report cannot
  honestly show month-over-month price/output/employment changes. E1 shows current values
  separately and labels the gap; adding a bounded series belongs to a later decision.
- Action history is session-only; save/load and restart clear it.
- Native iOS/Android release and on-device performance remain the M7 exception; E1 did
  not certify them.
- Explanations are a small, high-quality rule set, not a generic causal engine. They state
  observations and likely contributing constraints, with explicit caveats.

**Acceptance mapping:** §17A.13.1 questions are answered by Overview, the drill-down
screens, Budget preview, and Ledger report/history. The surfaces required by the
§17A.13.2 tasks are present and covered by source-level wiring tests; no separate
moderated usability study or device test was run. No E2–E6 lever is enabled. The
"actual effect" requirement is met for the only existing fiscal action by confirmed
snapshots plus monthly flows, not by forecasting.

### 17A.18 E2 implementation record

**Status:** implemented on branch `main` in code/tests/bundle commit
`f9aa4e0e2ea9d59dd1999d72704eb9d5261d75d2`, based on M7a documentation commit
`fdf429a7aeea4dccf4a6699e0ad4d361028f7343`. Schema **18**, simulation **0.18.0**, save
format **1**, data version **`m3-economy-v3`**, worker protocol **5**. The E2 scope and
acceptance criteria are §17A.14 and §17A.13.2; the material decisions are D-073. E2
changes authoritative fiscal state, action semantics, reporting, and the immutable
snapshot contract; it does not add E3–E6 mechanics.

#### Delivered instruments

| Instrument | Base | Calculation and timing | Posting path | Bounds and constraints | Player control |
|---|---|---|---|---|---|
| Personal income tax schedule | Actual daily wages received by each pop block | `incomeTaxRate × max(0, wages − incomeTaxAllowanceRUSDPerYear / daysInYear)`, withheld every processed day at the fiscal phase | Household `income-tax-expense`/`household-cash` ↔ country `treasury-cash`/`income-tax-revenue` (`income-tax`) | Rate 0..1; exemption nonnegative and numeric-safety bounded; tax cannot exceed wages or household cash; no tax on welfare or zero wages | `set-fiscal-policy` |
| Welfare transfer with eligibility | Policy budget and eligible blocks (positive population, wealth level ≤ `welfareMaxWealthLevel`) | Annual budget ÷ civil-year days; proportional allocation across eligible population with an exact final remainder; payable limited by treasury cash above `reserveTargetRUSD` | Country `welfare-expense`/`treasury-cash` ↔ household `household-cash`/`welfare-income` (`welfare-transfer`) | Budget nonnegative and bounded; ceiling integer 0..99; unpaid budget is an explicit shortfall, never a liability; no eligible block pays nothing | `set-fiscal-policy` |
| Business-profit tax | Each building's recognized current-period `sales-revenue − input-expense − wage-expense − upkeep-expense`, positive part | Assessed once per civil month-end after the fiscal phase, before the debt phase and the close; collected from operating cash | Building `business-tax-expense`/`operating-cash` ↔ country `treasury-cash`/`business-tax-revenue` (`business-profit-tax`) | Rate 0..1; collection ≤ operating cash; uncollected assessment is an explicit shortfall, not a receivable; a duplicate same-day assessment is rejected; losses are not refunded or carried forward for tax | `set-fiscal-policy` |
| Treasury reserve | Actual treasury cash and `reserveTargetRUSD` | Daily welfare cash ceiling and discretionary repayment floor | No special posting | Policy floor only: never creates cash, never causes borrowing, never blocks contractual coupon/maturity/arrears payments | `set-fiscal-policy` |
| Debt issuance | Existing designated creditor, coupon, term, ceiling, creditor cash, contract cap | Immediate validated action; interest accrues daily per the existing contract rules | Existing `debt-issuance` posting | Principal positive and finite; creditor's actual cash; outstanding-principal headroom; active-contract cap | `issue-debt` |
| Debt repayment | One outstanding contract and actual treasury cash | Immediate validated action; principal only | Existing `debt-principal-repayment` posting | Amount positive and no larger than outstanding principal; treasury cash covers it; post-payment cash ≥ reserve target | `repay-debt` |
| Debt policy | Existing refinancing flag and outstanding-principal ceiling | Immediate validated action; affects the next maturity and future issuance/financing | No posting | Country debt policy must be enabled; ceiling nonnegative, bounded, and never below current outstanding principal; creditor/coupon/term remain scenario/contract inputs | `set-debt-policy` |

The complete fiscal policy, including the exemption, eligibility ceiling, business-tax
rate, and reserve target, is one validated action so a change cannot leave a stale
schedule or reserve. Every action passes `validateCountryAction` before mutation and
`applyCountryAction` validates the complete candidate world before publication. A
player-sourced action may only target the designated player country; an AI-sourced
action may never target it, adding defense in depth to the existing AI-phase skip.

#### Budget decomposition and reporting

`FinancePeriodSummary` and `AnnualFinanceSummary` carry exact per-country budget
totals in addition to the accounting fiscal totals:

- `welfareRequestedRUSD` and `welfareShortfallRUSD` (unpaid budget; paid welfare is the
  period `welfareExpenseRUSD`);
- `businessTaxAssessedRUSD` and `businessTaxUncollectedRUSD` (collected business tax is
  the period `businessTaxRevenueRUSD`);
- `debtIssuedRUSD`, `principalRepaidRUSD`, `interestPaidRUSD`, and
  `unfinancedRequirementRUSD`.

`FinancePeriodFiscalTotals` adds `businessTaxRevenueRUSD`, and
`netFiscalResultRUSD = incomeTax + businessTax − welfareExpense − interestExpense`.
Annual flows remain exact sums of the year's monthly summaries; annual balances remain
year-end stocks. Zero-only budget entries are omitted from summaries and read as zero,
keeping the bounded save small. The month-to-date memo
(`FinanceState.budgetMemosThisMonth`) is frozen into the summary at the close and
reset; it is not a liability ledger. A controlled correction can legitimately separate
a memo amount from the corresponding recognized account line, so reporting shows both
rather than assuming they always agree.

#### Financing semantics and ordering

- The month-end financing requirement is
  `max(0, requested welfare this month + interest expense − income-tax revenue −
  business-tax revenue − treasury cash)`. It is constrained by the creditor's actual
  cash, the outstanding-principal ceiling, and the active-contract cap; the unfinanced
  part is reported and never booked as an invisible liability.
- Player borrowing posts immediately and increases treasury cash, so the automatic
  month-end requirement is correspondingly smaller; the same gap is not borrowed twice.
- Daily order on a civil month-end: AI phase → demography/employment/migration → market
  and wage/upkeep settlement → fiscal phase (income tax then welfare) → business-tax
  phase → debt phase (interest accrual, automatic financing, coupons, maturities,
  refinancing, arrears/default) → needs/militancy/wealth → monthly close (capturing the
  budget memo) → M5a profit distribution using the after-tax period result. Player
  actions are applied only between completed ticks at the current world day, before that
  day's phases.
- The reserve floor applies only to daily welfare and discretionary principal
  repayment. Contractual coupon, maturity, and arrears payments are never blocked by
  it, so the policy cannot manufacture a default.

#### Snapshot, protocol, and state consequences

- `Country.fiscal` gains `incomeTaxAllowanceRUSDPerYear`, `welfareMaxWealthLevel`,
  `businessProfitTaxRate`, and `reserveTargetRUSD`; scenario input may omit them and
  they default to neutral values (zero exemption, 99 universal, zero business tax, zero
  reserve). Persisted policy is validated as complete.
- New account subtypes: country `business-tax-revenue`, building
  `business-tax-expense`. New cash-neutral transaction kind: `business-profit-tax` with
  a central semantic rule and structural posting validation.
- `FinanceState.welfareRequestedThisMonth` is replaced by
  `FinanceState.budgetMemosThisMonth`; summaries gain `countryBudgetTotals` (and annual
  summaries gain `budgetTotals`); compacted summaries retain the budget decomposition but
  no account trial balance.
- Worker protocol **5** adds the action union (`set-fiscal-policy`, `issue-debt`,
  `repay-debt`, `set-debt-policy`) and required presentation fields: extended fiscal
  policy, debt policy/contracts, estimated taxable wage base, wage-earning block count,
  month-to-date business-tax base and budget memo, and budget totals in monthly/annual
  reports. Commands remain correlated; the snapshot remains immutable and bounded.
- Schema 18 / simulation 0.18.0 / protocol 5 are incompatible with earlier saves and
  clients; no migration is implemented under the existing policy (D-013).

#### Data sources and deliberate limits

| Measure | Source | Limit |
|---|---|---|
| Estimated taxable wage base | Current employment × profession base wage ÷ civil-year days, with the current exemption applied per block | Estimate, not realized wages; a *proposed* exemption cannot be computed exactly from the snapshot because per-block wage levels are not retained, so the preview labels an assumption |
| Business-tax base in preview | Sum of positive building month-to-date results from live accounts | Month-to-date static base; actual month-end assessment can differ |
| Business-tax revenue/assessment | Closed-period summary and month-to-date memo | Exact for the closed period |
| Welfare eligible population | Live block population and wealth level at the fiscal phase | A proposed ceiling's eligible population is not retained per threshold, so the preview does not estimate it |
| Debt constraints | Snapshot debt policy, creditor cash, headroom, and outstanding contracts | Authoritative validation remains in the simulation; UI values are presentation-only |

Deliberately not added: consumption/excise, property/land, and customs taxes;
education/health/administration spending; procurement; subsidies; construction; a bond
market; banking; central-bank operations; monetary issuance; inflation/FX claims;
GDP/unemployment/real-income headlines; or policy-attribution percentages.

#### Verification and acceptance evidence

`packages/tests/src/e2-fiscal-management.test.ts` covers exact income-tax/allowance
arithmetic, welfare eligibility and allocation, reserve-limited welfare and repayment,
business-tax assessment/collection/uncollected cases, the duplicate-assessment guard,
discretionary borrowing versus automatic month-end financing, reserve-constrained
repayment, refinancing/ceiling policy, invalid-action rollback, monthly
requested/paid/shortfall and financing reconciliation, annual flow/balance
reconciliation, save/load/hash and deterministic replay, and the player/AI boundary.
Existing suite updates cover the extended action shape, protocol version, schema
version, snapshot contract, and annual budget fields.

Commands and results are recorded in the v2.9 change report. Benchmarks, performance
measurements, campaign runs, and device tests were deliberately not run under the
developer's no-benchmark restriction; no benchmark code or thresholds were changed.

#### Remaining E2 limitations

- Collection efficiency remains fixed at 1.0; there is no administration,
  enforcement, or arrears machinery for either tax.
- The business tax does not carry losses forward for tax purposes, has no sector
  classification or deduction rules, and is limited by each building's operating cash.
- Welfare eligibility is a single wealth ceiling, not categorical or needs-tested law.
- The reserve floor is a simple liquidity constraint, not a full treasury-management
  policy; it does not influence borrowing terms or creditor willingness.
- The preview's proposed-exemption taxable base is an assumption-based estimate rather
  than an exact computation.
- E3 construction/public investment, E4 subsidies/procurement, E5 services/human
  capital, and E6 trade/monetary mechanics remain unimplemented; their levers are not
  exposed.
- Native/device performance and the M7 device exception remain unchanged.

**Acceptance mapping:** §17A.13.2 E2 requires every implemented instrument to define its
base, calculation, posting path, timing, bounds, and UI explanation; a validated action
with an observable next-period effect; separate requested/paid/shortfall and
revenue/borrowing/principal/interest; and rejection or explicit unfinance of
unaffordable plans. §17A.18 and the tests above demonstrate each point. No moderated
usability study or device test was run.

### 17A.19 E3 implementation record

**Status:** implemented on branch `main` in code/tests/bundle commit
`e3b6fff5025af747f0fc78cc6941e1f93631e5ea` (core construction) and `a8c6a9edd2b400dcfd676478222c612efd7c2f1e` (state-ownership UI gate), based on the E2 documentation commit
`d3a4ac0cd3aa6f15b4b45cd563820d172d3a20c0`. Schema **19**, simulation **0.19.0**, save
format **1**, data version **`m3-economy-v4`**, worker protocol **6**. The E3 scope
and acceptance criteria are §17A.6, §17A.14, and §17A.13.2; the material decisions are
D-074. E3 changes authoritative construction state, the daily tick, the action set,
reporting, data definitions, and the immutable snapshot contract. It does not add
E4–E6 mechanics.

#### Scope and ownership model

E3 implements **public construction of government-financed, state-owned productive
buildings**. The player authorizes a project in a country-owned region, the treasury
pays actual construction wages over time, and completion creates a real building
instance that participates in the ordinary production, employment, market, tax, and
M5a state-remittance systems.

The scoped subset is **money + actual idle labor + time**. Materials are not modeled
because the current data has no construction bill of materials and there is no
government procurement demand/delivery path; §17A.16 explicitly permits this subset
when scoped. E3 does not implement private-supported projects, subsidies, loans,
guarantees, public-enterprise operation/expansion policy, material procurement,
transport-dependent infrastructure, or destruction/closure. Those remain E4/E5/E6a
dependencies.

#### Project model and authorization

| Element | E3 implementation |
|---|---|
| Project type | Validated building definition with at least one productive output, positive `constructionCostRUSD`, positive authored `constructionWorkers`, no required technology, no resource requirements, and state ownership allowed. Warehouse-only capacity is not offered. |
| Parameters | `totalCostRUSD` is the definition construction cost; `workingCapitalRUSD` is 30 days of the definition's level-1 daily upkeep (a provisional structural target); `constructionWorkers` is the maximum daily crew. |
| Location | One country-owned region with a valid market. No land/space/transport access model is claimed. |
| Authorization | `start-construction` is player-only. It requires the project type to be currently buildable, the region to be owned by the country, the M5a state-remittance policy to be enabled, fewer than 32 non-terminal projects, and treasury cash at least `totalCostRUSD + workingCapitalRUSD`. No money is escrowed or reserved. |
| Identity | Monotonic `nextProjectId`; project records are ordered by ascending id. `nextBuildingId` is monotonic and initialized above every existing building id. |
| Retention | At most 32 non-terminal projects; at most 32 terminated project records retained in detail; older terminated records are compacted into per-country counters/amounts (bounded at 256 aggregates). |
| Cancellation | Player-only `cancel-construction` for any non-terminal project. Spent work-in-progress is written off; no refund or liability. |
| Suspension | Player-only `set-construction-paused`; pause stops hiring/progress, resume continues from the same spend. |

Authorization does not reserve funds. A project can later stall when treasury cash is
insufficient for a day's wage; this is a deliberate pay-as-you-go constraint, not a
hidden credit line.

#### Daily construction phase

The phase runs on every processed day after the business-tax phase and before the debt
phase and the monthly/annual close. It does not run on the 2000-01-01 terminal boundary.
Projects are processed in ascending id order.

1. A project authorized on the current day makes no progress until the next day.
   Paused, completed, and cancelled projects are skipped.
2. **Idle labor only.** For each block in the country, eligible workforce is
   `floor(working-age population × profession participation)` when the block matches
   the profession and qualification thresholds. `world.employment` assignments are
   subtracted; workers claimed by an earlier project that day are also subtracted.
   Construction workers are never added to `world.employment`, so a worker cannot be
   counted both in production and construction.
3. The project hires at most its authored crew and at most the workers whose daily base
   wage the treasury can actually pay. The daily wage is
   `profession.baseWage1900RUSDPerYear / daysInYear` for the block's profession.
4. Gross paid wages increase the project's `spentRUSD` and progress. The final payment
   is clamped so spend reaches the authorized total exactly. Progress is
   `spentRUSD / totalCostRUSD`.
5. Gross wages are paid to the workers' household blocks and capitalized; the existing
   daily income tax is applied to construction wages using the remaining daily
   allowance after the block's settled market wages. No income tax is charged on
   welfare or zero wages.
6. A project with no hired worker is `waiting` and records `funds` when treasury cash is
   below the cheapest available daily wage, otherwise `labor`. A project with hires is
   `active`. No project work is fabricated when no worker is hired.
7. When cumulative spend reaches the authorized cost, completion runs after the wage
   batch: the building and its accounts are created, work-in-progress is reclassified
   to public capital, and a cash-limited working-capital endowment is transferred.
8. The phase works on a staged copy of finance, construction, buildings, and regions,
   validates the complete candidate, and publishes only on success. A failure leaves the
   prior world intact.

A completed building is level 1, condition 1, operational, state-owned, owned by the
country treasury, and has a full account set (`operating-cash`, `owner-equity`,
`sales-revenue`, `input-expense`, `wage-expense`, `upkeep-expense`,
`business-tax-expense`, and `retained-profit` when distribution is enabled). It is
appended to the region, sets `employmentDirty`, and produces through the ordinary
systems from the next processed day. Completion does not grant an instant output
bonus.

#### Accounting and reporting

| Flow | Posting | Cash effect |
|---|---|---|
| Daily construction wages | Country `construction-in-progress` debit / treasury credit; household cash debit / `wage-income` credit (`construction-wage`) | Cash-neutral between country and households |
| Income tax on construction wages | Household `income-tax-expense`/cash → country `treasury-cash`/`income-tax-revenue` (`income-tax`) | Cash-neutral; existing tax path |
| Completion capitalization | Country `construction-in-progress` credit / `public-capital` debit (`construction-capitalization`) | None |
| Completion working capital | Country treasury credit / owner-equity debit; building `operating-cash` debit / owner-equity credit (`construction-working-capital`) | Cash-neutral transfer from country to building |
| Cancellation write-off | Country `construction-in-progress` credit / country owner-equity debit (`construction-writeoff`) | None |

Construction cost is **capitalized, not expensed**. `constructionSpentRUSD` and
`constructionWrittenOffRUSD` are added to the month-to-date budget memo and to monthly
and annual budget decompositions; they are capital outlay/write-off measures, not
welfare or interest expense. The accounting identity, aggregate designated-cash
conservation, and all existing close/annual invariants hold.

#### Snapshot, protocol, and data consequences

- World schema **19** adds `World.construction` (`projects`, `history`,
  `nextProjectId`, `nextBuildingId`) and the two country asset accounts.
- Four cash-neutral transaction kinds: `construction-wage`,
  `construction-capitalization`, `construction-writeoff`,
  `construction-working-capital`, each with central semantic and structural posting
  validation.
- Data version **`m3-economy-v4`**: every authored building definition gains
  `constructionWorkers` and permits `"state"` ownership. This is a definition-meaning
  change, not a silent content edit; historical/generated artifacts are regenerated.
- Worker protocol **6** adds `projectTypes` and per-country project/queue/history/
  labor/WIP/public-capital fields, construction budget fields, and the action DTOs
  `start-construction`, `cancel-construction`, and `set-construction-paused`.
  Snapshots remain immutable, bounded, and free of accounts/postings.
- Schema 19 / simulation 0.19.0 / protocol 6 / data v4 are incompatible with earlier
  saves and clients; no migration is implemented under the existing policy (D-013).
- Save/load, deterministic replay, and known-answer hashes change intentionally;
  fixtures were updated rather than weakened.

#### Player workflow

The **Construction** tab shows treasury cash, work-in-progress, public capital,
month-to-date construction outlay/write-off, idle construction labor and mean wage, and
retained history. The player selects a buildable project type and country-owned region,
then sees the authored cost, crew cap, planned jobs, output capacity, 30-day working
capital target, upfront treasury requirement, static duration estimate, and explicit
assumptions/constraints. Authorization, pause/resume, and cancellation go through the
validated worker action path; rejected actions leave state unchanged. The queue shows
status, progress, spend/remaining, last-day workers, funds/labor blockers, completion
day, and building id. Monthly/annual ledger views show construction outlay and
write-off separately from expense.

#### Deliberate limits and remaining dependencies

- **Materials/procurement:** not modeled; E4 must add a real bill of materials,
  procurement demand, delivery, inventory consumption, and balanced postings before
  material requirements are claimed.
- **Private-supported/public-enterprise programs:** not implemented; E4 adds
  subsidies/loans/guarantees, public-enterprise operation/expansion, and
  investment incentives.
- **Infrastructure:** no transport/access/capacity model; E6a or a dedicated model is
  required.
- **Land/space:** not modeled; project location is region ownership only.
- **Failure/destruction:** E3 supports funds/labor stalls, pause/resume, and
  cancellation; owner insolvency, explicit destruction, closure, and salvage are later
  work.
- **Labor opportunity cost:** construction hires only idle workers, so it does not
  reduce existing production employment. If no idle worker exists, the project waits.
- **Duration:** the UI estimate is static (current idle crew/wage, continuous funding),
  not a forecast of future labor-market or fiscal conditions.
- **AI:** construction is player-only in E3; AI economic behavior remains separate and
  must not fabricate hidden information.
- **Native/device:** the M7 device exception and performance verification remain
  unchanged.

#### Verification and acceptance evidence

`packages/tests/src/e3-construction.test.ts` covers buildable project selection,
authorization parameters and constraints, unsupported types/regions/funds/AI/cap
rejection, idle-labor hiring, multi-day payroll progress, exact completion spend,
state-owned building/account creation, ordinary production/employment after completion,
labor and funds stalls with resumption, cancellation write-off and rollback,
pause/resume, monthly/annual construction reporting, save/load/deterministic replay,
terminal-boundary rejection, bounded history compaction, immutable snapshot fields, and
preview validity. `m7-worker.test.ts` covers the validated worker action round-trip and
snapshot confirmation; `e1-ui-wiring.test.ts` checks the Construction tab/action path.

The full Node test suite and typecheck pass; the detailed commands/results are in the
v2.10 change report. Benchmarks, performance measurements, campaign runs, and device
tests were deliberately **not run** under the developer's no-benchmark restriction; no
benchmark code, thresholds, or reports were modified.

#### Acceptance mapping

§17A.6 requires a project model, real cost/labor/time, deterministic progress,
completion into a real asset, cancellation/interruption, persistence, and a UI. E3
delivers each for its scoped subset: projects consume real treasury cash and actual
idle labor, progress is causal payroll rather than a timer, completion creates a real
state-owned building with definition capacity, cancellation/failure is atomic and
accounted, save/reload and replay preserve the queue, and the app uses immutable
snapshots and validated actions. Materials, private co-financing, infrastructure, and
public-enterprise policy are explicitly deferred rather than simulated decoratively.

### 17A.20 E4 implementation record

**Status:** implemented on branch `main` in code/tests/bundle commit
`a859f2a89c8229fa12c9c57b7862307140fb721d`, based on the E3 documentation commit
`e0c591c54a4284d72dfa5a256a2762ad9619e035`. Schema **20**, simulation **0.20.0**,
save format **1**, data version **`m3-economy-v5`**, worker protocol **7**. The E4
scope and acceptance criteria are §17A.7, §17A.14, and §17A.13.2; the material
decisions are D-075. E4 changes construction/material state, country industrial policy,
the daily tick, the action set, reporting, data definitions, and the immutable snapshot
contract. It does not add E5–E6 mechanics.

#### Scope and instrument status

| Instrument | Status |
|---|---|
| Validated building-sector classification | **Implemented.** `BuildingDef.sector` is one of agriculture, food-processing, textiles, manufacturing, storage. |
| Sectoral production subsidy | **Implemented.** Ad-valorem rate per sector on verified daily gross output value at the current market price, paid from actual treasury cash. |
| Construction material requirements/procurement | **Implemented.** Authored material bills use existing goods; projects buy actual market stock at current prices, deliver, and capitalize the purchases. |
| Public-enterprise capital support | **Implemented.** Treasury capital contribution to an existing state enterprise's operating cash/equity. |
| Investment tax credits/deductions | **Not implemented / deferred.** Requires private/co-financed investment and a tax-credit or deduction mechanism. |
| Private co-financing, government-supported private projects | **Not implemented / deferred.** Requires a private-investor ownership/claim model. |
| Loans and guarantees | **Not implemented / deferred.** Requires credit/repayment and contingent-liability mechanics. |
| General goods/services procurement, open orders, delayed delivery | **Not implemented / deferred.** E4 procurement is immediate construction-material purchase/delivery against actual stock. |
| Public-enterprise expansion/discontinuation | **Not implemented / deferred.** E4 supports existing enterprises; it does not change their level or close them. |
| Industrial program bundles, price/production controls | **Not implemented.** Bundles would be composed of the component instruments; price controls are E7. |

No sector score, development-point pool, or decorative industrial modifier is added.

#### Sector classification and subsidy

`BuildingDef.sector` is authored, validated, and exposed in project/enterprise
snapshots. Each country has a validated `IndustrialPolicy.sectorSubsidyRates` array
covering every sector; a scenario may omit it (all zero). `set-industrial-policy` is a
player-only validated action that replaces the complete rate array, so a policy change
cannot leave a stale sector rate.

The subsidy phase runs after market/fiscal and before business tax. For every
production building in ascending building-id order:

1. the base is the physical output recorded by the completed production phase, valued
   at that market's post-clearing price;
2. entitlement is `sectorRate × verifiedGrossOutputValue`;
3. payment is limited by actual treasury cash, so aggregate payments cannot overdraw;
4. paid amount posts country `subsidy-expense` / treasury and building
   `operating-cash` / `subsidy-revenue` (`production-subsidy`); it is cash-neutral;
5. unpaid entitlement is accumulated as an explicit `subsidyShortfallRUSD`; it is not
   debt, a receivable, or cash already received.

Subsidy revenue is taxable enterprise revenue and is included in the month-end
business-profit tax base. A country's monthly/annual budget reports requested, paid,
and shortfall; the accounting fiscal totals add `subsidyExpenseRUSD` and subtract it
from `netFiscalResultRUSD`.

#### Construction materials and procurement

Every building definition carries `constructionMaterials` (existing good ids and
positive quantities). At authorization the project snapshots each requirement with
`deliveredQuantity = 0`; the requirements are part of persisted project state.

On each construction day, before hiring labor, the project buys missing material
quantities from the project region's market:

- market stock lots are consumed in canonical `(goodId, sellerBuildingId)` order;
- the current market price is used; purchase quantity is limited by remaining
  requirement, actual lot stock, and treasury cash;
- the seller's market lot decreases, its operating cash increases, and its
  `sales-revenue` increases; the country debits `construction-in-progress` and credits
  treasury (`construction-material-purchase`);
- the delivered quantity increases by the actual purchase; the requirement cap prevents
  duplicate delivery/consumption on phase retry or replay;
- if stock is absent/insufficient the project waits with `materials`; if cash is
  insufficient it waits with `funds`;
- labor is hired only after all requirements are delivered, so materials cannot be
  skipped;
- cancellation writes off both labor and material work-in-progress; completion
  capitalizes both into `public-capital`.

Purchase and delivery are atomic against actual stock. E4 does not create an unfilled
order or treat an order as delivered stock; open orders/delayed delivery are deferred.
General government services procurement is not implemented.

#### Public-enterprise support

`support-public-enterprise` is a player-only validated action for an existing
state-owned building in the country's regions, owned by its treasury. The amount must
be positive, within a numeric-safety bound, and covered by actual treasury cash.

The posting is country treasury credit / country owner-equity debit and building
operating-cash debit / building owner-equity credit
(`public-enterprise-capital-contribution`). It is a capital contribution, not an
expense, loan, guarantee, or unconditional transfer. It does not change ownership,
level, condition, inputs, sales, wages, tax, or remittance obligations; ordinary
production/employment/market/tax/M5a rules continue. The monthly budget reports
`publicEnterpriseSupportRUSD` as a capital flow. Expansion, discontinuation,
privatization, and nationalization remain deferred.

#### Accounting and reporting

| Flow | Posting | Cash effect |
|---|---|---|
| Construction material purchase | Country `construction-in-progress` debit / treasury credit; seller `operating-cash` debit / `sales-revenue` credit (`construction-material-purchase`) | Cash-neutral purchase; market stock decreases |
| Sectoral production subsidy | Country `subsidy-expense` debit / treasury credit; building `operating-cash` debit / `subsidy-revenue` credit (`production-subsidy`) | Cash-neutral transfer; subsidy expense/revenue recognized |
| Public-enterprise support | Treasury credit / country owner-equity debit; building operating-cash debit / owner-equity credit (`public-enterprise-capital-contribution`) | Cash-neutral capital transfer |
| Construction labor/materials completion | Work-in-progress credit / public-capital debit; labor and material cost both capitalized | None |

Construction outlay is reported as capital spending, not welfare/interest expense.
Subsidy expense and shortfall are separate from financing. Public-enterprise support is
a capital flow, not expense. The accounting identity, designated-cash conservation, and
monthly/annual flow reconciliation hold.

#### Snapshot, protocol, data, and persistence

- World schema **20** adds `Country.industrial`, project material state and
  `materialsSpentRUSD`, construction material budget fields, subsidy/support budget
  fields, and fiscal subsidy expense.
- Data version **`m3-economy-v5`** adds `sector` and `constructionMaterials` to every
  authored building definition (including historical variants). The change is a
  definition-meaning change; generated/historical artifacts were regenerated.
- New account subtypes building `subsidy-revenue` and country `subsidy-expense`; new
  cash-neutral posting kinds `construction-material-purchase`, `production-subsidy`,
  and `public-enterprise-capital-contribution`, with central structural validation.
- Worker protocol **7** adds project material/sector fields, country industrial policy/
  sector estimates/public enterprise list, subsidy/support budget and fiscal fields,
  and `set-industrial-policy` / `support-public-enterprise` action DTOs. Snapshots
  remain immutable, bounded, and free of accounts/postings.
- Schema 20 / simulation 0.20.0 / protocol 7 / data v5 reject older saves/clients; no
  migration is implemented under D-013. Save/load/replay preserve industrial policy,
  material progress, and support totals; canonical hashes change intentionally.
- Bounds: project material lists are as authored (bounded by data), public enterprise
  lists are derived from existing buildings, sector arrays have fixed length, and no
  new unbounded history is added.

#### UI and actions

The Industry tab exposes sector rates, current capacity value estimate, static daily
subsidy estimate, month-to-date requested/paid/shortfall, and explicit constraints. It
lists existing state enterprises with operating cash and a capital-support input, and a
clearly labelled “deliberately not implemented” section for private co-financing,
loans, guarantees, general procurement, and expansion/discontinuation. The Construction
tab shows material requirements, actual delivered/remaining quantities, current prices,
market stock/shortfalls, estimated material cost/total investment, material progress,
and `materials` stalls alongside funds/labor. The Ledger reports subsidy expense/
shortfall, material outlay, and capital support.

All actions go through the validated worker protocol; the app reads immutable
snapshots only. Rejected actions leave state unchanged.

#### Deliberate limits and remaining dependencies

- **No general procurement/services:** only construction/commissioning materials are
  bought; no open purchase orders, delayed delivery, or government service demand.
- **No private investment/co-financing:** no private investor claim/ownership model.
- **No loans/guarantees:** no credit or contingent-liability accounting; these are not
  approximated by grants.
- **No investment tax credits/deductions:** requires tax-credit/deduction rules and
  private investment.
- **No expansion/discontinuation:** support does not change enterprise level/condition
  or close it; privatization/nationalization are E7 ownership transfers.
- **No price/production controls:** E7.
- **Material bill scope:** authored quantities use existing goods as construction/
  commissioning inputs (seed, breeding stock, netting/packaging, raw materials); they
  are provisional content, not a historical engineering BOM.
- **Market scope:** procurement is domestic shared-market stock bought after market
  clearing at the current price; it does not inject a pre-clearing government-demand
  tier or change that day's clearing price. No imports/customs (E6a), transport cost,
  or supplier contracting.
- **AI:** industrial/support actions are player-only; AI must not use hidden
  information.
- **Native/device:** M7 exception and performance verification remain unchanged.

#### Verification and acceptance evidence

`packages/tests/src/e4-industrial-policy.test.ts` covers sector taxonomy/material
snapshot, actual material purchase and capitalization, shortage/wait/resume, duplicate-
delivery prevention, subsidy payment/shortfall/accounting and business-tax base,
public-enterprise capital support, invalid/AI/action rejection, snapshot/previews,
save/load/replay, and monthly/annual subsidy/support reconciliation. Existing E3 tests
were strengthened to cover material-inclusive capitalization/write-off/reporting;
`m7-worker.test.ts` covers the industrial-policy action and rejected support;
`e1-ui-wiring.test.ts` covers the Industry tab/action wiring.

The full Node correctness suite and typecheck pass; exact commands/results are in the
v2.11 change report. Benchmarks, performance measurements, campaign runs, and device
tests were deliberately **not run** under the no-benchmark restriction; no benchmark
code, thresholds, or reports were modified.

#### Acceptance mapping

§17A.7/E4 requires at least one coherent instrument that changes actual enterprise/
budget/production/investment behavior, with unsupported instruments labelled and fiscal
cost/trade-offs visible. E4 delivers three integrated components: a sectoral subsidy
with a verified physical-output base and cash-limited treasury payment; construction
material procurement with actual stock, seller revenue, WIP capitalization, shortages
and resumption; and public-enterprise capital support with capital (not expense)
accounting. Every new flow has balanced postings, report fields, action validation, and
tests. Private co-financing, loans, guarantees, investment tax credits, general
procurement, expansion/discontinuation, and price controls are explicitly labelled
rather than exposed as decorative controls.

---

## 17B. M7a Annual Accounting — implementation record

**Status:** implemented on branch `main` in code/tests/bundle commit
`c8b2e4cd72aa049243c07dfdb413e00c708d07cf`, based on E1 documentation commit
`4d697aa131d7d6e60782665d62e8caa9bb9fc5f9`. Schema **17**, simulation **0.17.0**, save
format **1**, data version **`m3-economy-v3`**, worker protocol **4**. The source
scope and acceptance criteria are §17.3 and D-072. M7a changes authoritative finance
state; it does not add E2–E6 policy mechanics.

### 17B.1 Period boundaries and calendar rules

- An annual period is a civil calendar year.
- The annual summary is appended immediately after the 31 December monthly close,
  after that day's activity and month-end wealth update, and before `dayIndex`
  advances to 1 January.
- The first campaign year may be partial when `World.startDayIndex` is after 1
  January; `complete` is exactly `periodStartDay === January 1`.
- Later annual periods start on the day after the previous 31 December and are
  complete.
- Leap years use the existing Gregorian calendar; 1904, 1908, … close after 366
  daily transitions. The monthly closes still use actual month lengths.
- The terminal `2000-01-01` boundary is not a processed year and never creates an
  annual 2000 summary. The last campaign annual period is 1999.
- Annual summaries are ordered by year, contiguous, and duplicate years are rejected.

### 17B.2 Year-end closing and flow semantics

The 31 December M4b monthly close is the year-end closing entry: it zeroes revenue
and expense into each existing `owner-equity`, is cash-neutral, deterministic, and
preserves the accounting identity. M7a does not post a second closing entry and does
not re-run daily tax, welfare, market, or debt flows. Before creating the annual
summary, the close verifies that every revenue/expense account is zero; a residual
balance aborts the annual summary atomically.

Annual flows are exact sums of that year's monthly `countryFiscalTotals`:

- `incomeTaxRevenueRUSD`, `welfareExpenseRUSD`, `interestExpenseRUSD`;
- `netFiscalResultRUSD = tax − welfare − interest`;
- the four world gross `flowTotalsByKind`.

Annual balances are year-end stocks, not flows:

- `treasuryCashRUSD`;
- `debtLiabilityRUSD` (principal liability, excluding interest payable);
- `interestPayableRUSD`.

No annual account-level trial balance is retained. Annual totals are not the latest
monthly total repeated, and annual balances are not inferred by differencing
retained monthly history.

### 17B.3 Controlled corrections

`postFinanceCorrection` creates a new balanced `correction` posting with:

- a unique deterministic correction id;
- the current simulation day;
- the new posting id;
- the original posting id (provenance; the original need not remain in the bounded
  audit buffer);
- a required, trimmed, bounded reason;
- the posting lines retained in the correction record for audit.

The posting is applied atomically to a staged finance copy. The old posting and all
closed monthly/annual summaries remain unchanged. A prior-period correction lands in
the current open period; the next annual summary counts corrections posted during its
year (the count is world-wide, not allocated per country). Corrections are capped at 64
records; the audit posting buffer remains capped at 256. The terminal boundary and
mismatched days reject corrections. Account balances,
posting balance, affordability, ownership/semantic rules, and the accounting identity
are validated before publication; failure leaves `world.finance` unchanged.

### 17B.4 Bounded history and persistence

`FinanceState` gains:

- `annualSummaries` (at most 100; one per campaign year, compact per-country totals
  and balances only);
- `corrections` (at most 64 audited records);
- `nextCorrectionId`.

Monthly summaries remain bounded by the existing 1,200 cap and 12-month detailed
window. Annual summaries never store account trial balances. The snapshot exposes at
most the latest 12 annual reports per country (`MAX_SNAPSHOT_ANNUAL_REPORTS`); older
annual summaries remain in the save. Adding the fields changes canonical hashes and
save contents, so the existing policy rejects schema-16 saves rather than silently
migrating them.

### 17B.5 E1 integration

The Ledger adds an **Annual accounting** section:

- latest closed year, complete/partial label, and period dates;
- annual tax, welfare, interest, and net flows;
- year-end treasury, debt principal liability, and interest payable;
- corrected-entry count;
- recent annual summaries, labelled flows versus balances.

The snapshot’s annual report is presentation-only. It does not fabricate GDP,
inflation, real values, unemployment, or monthly market history.

### 17B.6 Tests and acceptance evidence

`packages/tests/src/m7a-annual-accounting.test.ts` covers:

- a complete 1900 year reconciling annual tax/welfare/interest to twelve monthly
  closes, with year-end treasury matching the account;
- leap-year 1904 closing after 366 transitions and exactly 12 monthly closes;
- partial first year, terminal 1999, and no annual 2000 period;
- save/load continuation across a year boundary and deterministic year ordering;
- compaction of the oldest monthly summary while annual history remains;
- serialization round trip and snapshot annual-report projection;
- a controlled correction posting once, preserving monthly summaries, with an
  unbalanced correction rolling back atomically and the annual correction count
  recording it.

No M7a-specific performance workload was added. The repository-wide `pnpm test`
also executes the pre-existing M1/M2 century regression tests (including the empty-
world 36,524-tick determinism checks); those are correctness tests, not benchmarks or
performance measurements. Benchmark reports were not regenerated.

### 17B.7 Remaining limitations

- Annual reports are retained for all campaign years but only the latest 12 are
  exposed in the immutable UI snapshot.
- Correction records are bounded; if an old original posting has left the 256-entry
  audit buffer, the correction still retains its original-posting id and reason but
  cannot display the original lines from the buffer.
- Corrections are an administrative simulation API, not a player-facing ledger action.
  No reopen, audit institution, inflation restatement, or annual tax assessment is
  implemented.
- Native/device verification remains the M7 exception.

---

## 17C. M8 Laws and Institutions — implementation record

**Status:** implemented on branch `main` by the M8 code/tests/bundle commit and its
documentation commit. World schema **21**, simulation **0.21.0**, save format **1**,
data version **`m3-economy-v6`**, worker protocol **8**. The authoritative scope is
§9.1–§9.5 and the §17 M8 definition of done; the material design choices and
limitations are D-076. M8 does not implement E5, M9, E6/M8a, or M10.

### 17C.1 Scope and instrument status

| §9 area | Status |
|---|---|
| Interest groups (§9.1) | **Implemented.** Seven fixed groups derived from pop-block professions; membership, organisation, normalised influence, and per-law stances are recomputed from authoritative state at world creation and on the monthly political refresh. Influence is not spendable. |
| Laws (§9.2) | **Implemented for taxation, suffrage, labor, and trade.** `propose-law` schedules enactment/change/repeal with support, regime eligibility, prerequisites, and enactment time. Education, health, military service, colonial policy, and currency have no proposable options in M8. |
| Elections and regimes (§9.3) | **Implemented.** Three regime kinds; elections only under an elected regime with a positive suffrage franchise, population, and minimum institution quality. Votes are bloc votes from the enfranchised population using the documented government-stance rule. |
| Militancy/unrest/instability (§9.4) | **Implemented.** Pop militancy remains the needs-driven indicator; regional unrest is new daily state; country crisis pressure accumulates from real conditions; stages are unrest → strike → crisis → revolution; revolution changes regime/government/laws and disrupts institutions without changing money or population. |
| Institutions and administration (§9.5) | **Implemented.** One state administration per country, clerk-based staffing, daily cash-limited payroll, derived quality/overload, and effects on tax collection, construction, enactment duration, and unrest. |
| Scripted events (§17 M8) | **Implemented.** Validated event definitions in data; scheduled queue with idempotent application and provenance; bounded log. |
| AI law/funding actions | **Not implemented.** The shared validator rejects AI-sourced M8 actions; AI behaviour is unchanged. |
| Console/UI | **Implemented.** Politics tab exposes regime/elections, interest groups, institutions/funding, law slots/proposals/transitions, regional unrest, crisis, and the bounded record. |

### 17C.2 Authoritative state

- `Country.regime`: kind, government group, next/last election day, one retained
  election result, and crisis stage/pressure days/last revolution.
- `Country.laws`: one law id per §9.2 slot; 0 means no implemented law.
- `Country.lawTransitions`: at most four in-flight transitions with slot, from/to
  law, proposed/effective day, source, and support at proposal.
- `Country.interestGroups`: seven records with membership, organisation, influence,
  and stance by law id.
- `Country.institutions`: annual funding target, staffing by profession, service
  output index, quality, overload, disruption end day, last update day, and
  month-to-date funding request/shortfall memo.
- `Region.unrest` and `Region.infrastructure`: regional unrest and provisional
  infrastructure quality.
- `World.politics`: enabled flag, bounded scripted-event queue, bounded event log,
  and allocators.

All fields are plain JSON-serializable data. No classes hold simulation state.

### 17C.3 Law model and effects

Each `LawDef` is validated data with a stable id, slot, prerequisites, eligible
regimes, base enactment days, tax-rate bounds, suffrage definition, border policy,
labor organisation/grievance, administration load, and seven group stances.

- **Taxation:** statutory bounds on income-tax and business-profit-tax rates. New
  fiscal actions are validated against the intersection of the hard 0..1 bounds and
  the enacted law bounds. When a law with tighter bounds becomes effective, the
  current rate is clamped forward on that day and the compliance is logged.
- **Suffrage:** none/property/male/universal franchise; used by elections and by the
  political-exclusion component of unrest.
- **Labor:** legal organisation and grievance. Repression lowers labor organisation
  and raises grievance; protected labor raises organisation and lowers grievance.
  Wages, hours, and bargaining remain E5.
- **Trade:** border access only (`Country.immigrationOpen`). Tariffs, customs, and
  trade agreements remain E6a.
- **Support:** influence-weighted group stances plus a provisional governing-group
  alignment term (`0.3 × governing-group influence × its stance`); the proposal
  threshold is 5%. Influence is derived and never spent. An election outcome
  therefore changes which laws are politically feasible.

Enactment duration is `ceil(baseDays / (0.5 + 0.5 × quality))`, bounded to
`baseDays..2 × baseDays` and persisted at proposal. The law becomes effective at
the start of its effective day. It never rewrites a closed month, annual summary,
or past report.

### 17C.4 Elections and crisis

- Franchise is derived from the suffrage law: property uses the block wealth
  threshold; male/universal use age 21; none yields no electorate.
- An election runs only when the regime enables elections, the franchise is
  positive, population is positive, institution quality is at least 0.25, and the
  scheduled day is due. A skip is logged and the next election is rescheduled.
- Votes are bloc votes from the enfranchised population. Each group's government
  support is `0.5 + 0.5 × average stance on the enacted laws`; the government wins
  at a vote share of at least 0.5, otherwise the group with the largest
  opposition-weighted electorate governs. Ties use group-key order.
- Crisis pressure weights population-weighted militancy, population-weighted
  regional unrest, unmet-subsistence population share, political exclusion,
  institution overload, and labor grievance. Pressure days accumulate only above
  the threshold and decay below it. Stages require 30/90/180/360 pressure days.
- Revolution changes a monarchy to a republic, changes the governing group to the
  largest opposition group, resets laws to republican defaults, cancels in-flight
  transitions, applies a one-year institutional disruption, and records a bounded
  log entry. A five-year cooldown prevents a deterministic loop.

### 17C.5 Institutions, payroll, and derived effects

The state administration is staffed by the country's clerks (the authored
administration profession). The model does not create government buildings or
duplicate people; this is a documented simplification.

- `fundedAnnualRUSD` is an annual target paid daily.
- The fiscal phase pays `target / daysInYear` after income tax and welfare, limited
  by actual treasury cash above the reserve floor. Posting: country
  `administration-expense` debit / treasury credit; administration household
  `household-cash` debit / `administration-income` credit (cash-neutral
  `administration-payroll`). The unpaid request is an explicit month-to-date
  shortfall, not debt.
- Quality = weighted clerk staffing, funding adequacy, literacy, regional
  infrastructure, law-load factor, minus active disruption. Overload = staffing
  shortfall + funding shortfall + law load, bounded 0..2.
- Tax collection efficiency = `clamp(0.6 + 0.4 × quality − 0.2 × min(overload,1),
  0.4, 1)`. Uncollected tax is simply not collected; it is not a receivable.
- Construction progress factor = `clamp(1 − 0.3 × min(overload,1) − 0.2 ×
  (1 − quality), 0.4, 1)`; it reduces the daily construction crew.
- Strike/crisis stages reduce production throughput in regions with unrest at or
  above 0.6 to the documented strike factor; goods, cash, and people are not
  deleted.

### 17C.6 Accounting and reporting

| Flow | Posting | Effect |
|---|---|---|
| Administration payroll | Country `administration-expense` debit / treasury credit; household cash debit / `administration-income` credit (`administration-payroll`) | Cash-neutral transfer; treasury cash falls, household cash rises, expense/revenue recognized |
| Tax collection | Existing `income-tax` / `business-profit-tax` postings, amount multiplied by derived collection efficiency | Treasury revenue equals actual withheld cash |
| Construction progress | Existing wages/materials capitalization | Lower crew cap, not a second accounting path |
| Crisis/revolution | No monetary posting | Real state change only |

Fiscal totals add optional `administrationExpenseRUSD`; budget totals add
`administrationRequestedRUSD` and `administrationShortfallRUSD`;
`netFiscalResultRUSD = incomeTax + businessTax − welfare − interest − subsidy −
administrationExpense`. The accounting identity, designated-cash conservation, and
monthly/annual reconciliation hold. Net fiscal reconciliation across monthly
summaries now also subtracts subsidy and administration expense.

### 17C.7 Ordering, determinism, and atomicity

The economic day order becomes:

1. politics: due scripted events, effective law transitions, first-of-month
   institution/interest-group/election/crisis refresh;
2. country AI (unchanged);
3. demography/employment/migration/market/fiscal (fiscal includes administration
   payroll and collection efficiency);
4. industrial subsidy, business tax, construction (crew cap from institution
   quality), debt;
5. needs/militancy, then regional unrest, wealth, close, M5a distribution.

The whole day remains staged on a structural clone and published only after final
validation. Politics rows/events are copied by the clone. Country, group, law, and
event processing use ascending stable ids/keys. No M8 rule uses `Date`,
`Math.random`, wall time, or a shared mutable PRNG.

### 17C.8 Snapshot, protocol, data, and persistence

- Worker protocol **8** adds `propose-law` and `set-institution-funding` DTOs;
  country snapshots gain a bounded politics section (regime, elections, crisis,
  franchise/support, groups, institution, law slots/options/transitions, deferred
  slots, recent log) and region snapshots gain unrest/infrastructure. Snapshots
  remain immutable and contain no accounts, postings, or live world.
- Data version **`m3-economy-v6`** adds `politics.json` (regimes, interest groups,
  laws, events, administration profession keys) and scenario regime/law/funding and
  regional infrastructure inputs. Generated worker scenario and app bundle are
  regenerated.
- Save schema 21 / simulation 0.21.0 / protocol 8 / data v6 reject older
  saves/clients; no migration is implemented under D-013. Period/annual
  `countryBudgetTotals` use a sparse encoding: zero fields are omitted and a
  missing field decodes as zero. This keeps the 1,200-month synthetic save under
  the 4 MiB canonical target after the M8 administration fields were added.
- Bounded state: 4 law transitions per country, one retained election result, 7
  groups, 9 law slots, fixed event definitions, 256 queue entries, 64 log entries,
  no per-day political history.

### 17C.9 UI and player workflow

The Politics tab shows regime/election state, franchise and government support,
interest-group membership/organisation/influence/stance, institution quality/
overload/funding/request/shortfall, implemented and deferred law slots with support
and eligibility, in-flight transitions with effective dates, regional unrest,
crisis pressure/stage, and the bounded political record. The player can propose,
change, or repeal a law and set the administration funding target. Previews are
computed from the immutable snapshot; the authoritative support/efficacy/timing
validation remains in the simulation. All actions use the validated worker
protocol; rejected actions leave state unchanged.

### 17C.10 Acceptance mapping and evidence

- **Law/election outcomes follow documented prerequisites:** `propose-law` checks
  slot/option, current law, one transition per slot, transition cap, regime,
  prerequisites, support threshold, day, player authority, and AI rejection.
  Elections require an elected regime, franchise, population, due day, and minimum
  quality. Evidence: `packages/tests/src/m8-politics.test.ts` (law validation,
  effective-day timing, statutory fiscal bounds, election/no-election, replay) and
  `e1-ui-wiring.test.ts`.
- **Revolution or regime crisis from simulated causes:** crisis pressure uses
  measured militancy/unrest/unmet/exclusion/overload/grievance; stage thresholds
  are deterministic; revolution has documented consequences. Evidence: the crisis
  test and monthly reconciliation test.
- **Scripted events idempotent with provenance:** queued events apply once, record
  provenance, and survive save/load. Evidence: the event test.
- **No decorative controls:** five law slots have no options; the UI labels them
  deferred. Trade law is explicitly border-access-only. AI law/funding actions are
  rejected rather than faked.
- **Accounting/conservation:** payroll and collection efficiency tests check
  cash-neutral posting, designated-cash conservation, actual receipts, and monthly
  reconciliation. No M8 rule creates cash, people, goods, buildings, or debt.

### 17C.11 Verification and deliberate limits

The full non-benchmark Node correctness suite and all typechecks pass (**62 suites /
663 tests**); exact commands/results are in `docs/archive/gdd-change-reports/GDD_V2.12_CHANGE_REPORT.md`.
Benchmarks, performance measurements, campaigns, stress/soak runs, and device tests
were deliberately not run under the no-benchmark restriction; no benchmark code,
thresholds, or reports were modified.

Deliberate limits:

- AI law proposals and AI institution funding are not implemented.
- Education/health/currency/colonial/military-service law mechanics are deferred to
  M9/E5/E6b/M10; no options are exposed.
- Trade law changes border access only (migration). Tariffs, quotas, and export
  restrictions are E6a `set-trade-policy`; trade agreements remain unimplemented.
- Labor law changes organisation/grievance only; minimum wages, hours, bargaining,
  and social insurance are E5.
- The player cannot directly calm unrest; only real policy and outcomes change it.
- Riots/building damage, separate general-strike event content, and player
  crisis-response actions are not implemented.
- Clerk staffing for administration is a documented simplification; government
  employment/service buildings are not modeled.
- Institution coefficients, law durations, support threshold, event content, and
  infrastructure values are provisional, not historical calibration.
- Native/device verification remains under the M7 exception.

---

## 17D. M9 Technology and Education — implementation record

**Status:** implemented on branch `main` by the M9 code/tests/bundle commit and its
documentation commit. World schema **22**, simulation **0.22.0**, save format **1**,
data version **`m3-economy-v7`**, worker protocol **9**. The authoritative scope is
§10.1–§10.3, §6.3, §6.8, and the §17 M9 definition of done; the material design
choices and limitations are D-077. M9 does not implement E5, E6/M8a, or M10.

### 17D.1 Scope and instrument status

| §10 area | Status |
|---|---|
| Technology graph (§10.1) | **Implemented.** `technology.json` holds 120 technologies across six eras with stable ids/keys, era, prerequisites, research work, and typed effects. Load-time validation rejects duplicate/non-positional ids, duplicate keys, unknown/self/repeated/cyclic prerequisites, later-era prerequisites, invalid work, and invalid effects. |
| Research work (§10.2) | **Implemented.** At most one active project per country; work is project-specific and retained on cancellation. Daily work comes only from available academic staff assigned to research, scaled by academic literacy, education quality, and funding adequacy. Zero staff, share, or funding yields zero work. Completion is recorded on the day the required work is reached; effects apply from the next civil day. |
| Literacy/education (§10.3) | **Implemented.** Authoritative single-year `literacyByAge`; the scalar literacy is the derived 15+ aggregate. School-age gains depend on teaching capacity, household wealth, enacted education law, education quality, funding, and technology. Ageing, migration, births, and deaths update the age-specific state. |
| Education law (§9.2) | **Implemented for the education slot.** `education-none`, `education-voluntary`, `education-compulsory-primary`, and `education-universal` use the M8 proposal, support, regime, prerequisite, effective-day, and bounded-transition pathway. Compulsory and universal require researched technologies. |
| Technology effects (§10.1) | **Implemented channels:** sector output productivity, mortality reduction, education-effectiveness, building unlock (`BuildingDef.requiredTechnologyId`), and law enable (`LawDef.requiredTechnologyIds`). Military capability is deferred to M10 and not authored. |
| AI research/education | **Not implemented.** The shared validator rejects AI-sourced M9 actions. |
| Console/UI | **Implemented.** A Technology tab exposes the catalog by era, prerequisites, effects, unlocks, research status/progress, education staffing/capacity/attendance/quality/funding, blocked reasons, and validated actions. |

### 17D.2 Authoritative state

- `World.technology.enabled`: authoritative scenario policy; `false` for legacy
  M2–M8 fixtures, where M9 is inert.
- `Country.technology`: `researched` (ascending id plus completion day, bounded by
  the catalog), `activeProject` (one project or null), and `workByTechnology`
  (project-specific accumulated researcher-days for started, incomplete projects,
  bounded by the catalog).
- `Country.education`: annual funding target, research staff share, last update
  day, and month-to-date requested/shortfall memo.
- `PopBlock.literacyByAge`: 81 authoritative single-year values. `PopBlock.literacy`
  is the derived, validated 15+ aggregate.

Derived values — academic staffing, capacity, enrolment, attendance, quality,
productivity/mortality/education factors — are recomputed from authoritative state
and validated definitions. They are never stored as a second authority.

### 17D.3 Research work and effects

- Available academic workers are participating working-age members of the authored
  academic profession minus existing academic employment assignments.
  `researchStaff = availableAcademicWorkers × researchStaffShare`;
  `teacherStaff = availableAcademicWorkers − researchStaff`.
- Daily work is `researchStaff × academicLiteracy × quality × fundingAdequacy`
  researcher-days. Funding adequacy is `fundedAnnual / (availableAcademicWorkers ×
  perStaffBenchmark)`, clamped to 1.
- `start-research` requires an existing, unresearched technology with every
  prerequisite researched and no active project. `cancel-research` clears the
  project and retains its accumulated work.
- A technology completes when accumulated work reaches `researchWork`; the research
  record carries `completedDay`, the work entry is removed, and the project clears.
  The phase runs after market settlement and the fiscal phase, so a completion
  applies from the next civil day and never rewrites a closed period.
- Sector productivity multiplies produced physical output from the same executed
  throughput and inputs. Mortality reduction multiplies the age/sex death rate.
  Education bonuses add to education quality. Building and law enables are checked
  by E3 construction and the law validator respectively.

### 17D.4 Education payroll and literacy

- Payroll target `fundedAnnualRUSD / daysInYear` is paid from actual treasury cash
  above the reserve floor. Posting: country `education-expense` debit / treasury
  credit; academic household `household-cash` debit / `education-income` credit
  (`education-payroll`). It is a cash-neutral transfer. The unpaid request is an
  explicit month-to-date shortfall, not debt or a receivable. The memo resets at the
  start of each civil month.
- Education quality = `0.6 × coverage + 0.4 × academicLiteracy + law quality bonus
  + technology education bonus`, clamped 0..1. Coverage is teaching capacity divided
  by school-age population, clamped to 1. Funding adequacy multiplies service output
  and research work, so zero funding yields zero service.
- School-age attendance is `min(coverage, clamp(0.45 + 0.55 × wealth/99 + law
  attendance floor, 0, 1))`. Literacy gain per age cell is `0.0015 × blockAttendance
  × quality × fundingAdequacy × (1 − literacy)`, applied only to ages 5–14.
- Ageing moves literacy with people (79 blends into 80+ by population weight);
  migration merges by age using the moved cells; births enter at zero; deaths change
  the age weighting and the derived adult aggregate is recomputed.
- Coefficients are provisional and live in the economy constants module with units
  and D-077 justification. They are not historical calibration.

### 17D.5 Accounting and reporting

| Flow | Posting | Effect |
|---|---|---|
| Education payroll | Country `education-expense` debit / treasury credit; academic household cash debit / `education-income` credit (`education-payroll`) | Cash-neutral transfer; actual treasury cash limits payment; unpaid request reported as shortfall |
| Research | no monetary posting | Real labour only; funded through the same education payroll |
| Technology completion/effects | no monetary posting | Real state/behaviour change only |

Fiscal totals add optional `educationExpenseRUSD`; `netFiscalResultRUSD` subtracts
it. Budget totals add optional `educationRequestedRUSD`/`educationShortfallRUSD`.
Per-country fiscal totals are now encoded sparsely (zero fields omitted; missing
decodes as zero), preserving exact values while keeping the 1,200-month canonical
save under the 4 MiB target.

### 17D.6 Ordering, determinism, and atomicity

The economic day order becomes:

1. politics: due events, effective law transitions, monthly refresh;
2. country AI;
3. demography (with the technology mortality factor read at day start), employment,
   migration;
4. market/production (with the sector productivity factor read at day start),
   settlement;
5. fiscal phase, then the **M9 education/research phase** (payroll, literacy,
   research work), then industrial subsidy, business tax, construction, debt;
6. needs/militancy, unrest, wealth, close, M5a distribution.

Lifecycle is deterministic and uses only validated state and definitions; no M9
rule uses `Date`, `Math.random`, wall time, or a shared mutable PRNG. The whole day
is staged and published only after final validation, so a failed or retried phase
cannot apply its effects twice. Research completions and literacy changes apply
forward only.

### 17D.7 Snapshot, protocol, data, and persistence

- Worker protocol **9** adds `start-research`, `cancel-research`,
  `set-education-funding`, and `set-research-staff-share` DTOs. The snapshot carries
  the immutable technology catalog once at its root (era names, prerequisites,
  effects, building unlocks, enabling laws) plus a bounded per-country status list
  (status, completed work, completion day), the active project, the research block
  reason, and derived factors, and an education section (staffing, capacity,
  enrolment, attendance, funding adequacy, quality, memo, blocked reasons). Law
  options expose required technology keys and whether they are met. Snapshots remain
  immutable and contain no accounts, postings, or live world. The catalog is sent once
  rather than duplicated per country to keep the snapshot bounded.
- Data version **`m3-economy-v7`** adds `technology.json`, the academics profession
  and population blocks, education law options, initial country research/education
  inputs, and two technology-gated building definitions. Generated worker scenario
  and app bundle are regenerated.
- Save schema 22 / simulation 0.22.0 / protocol 9 / data v7 reject older
  saves/clients; no migration is implemented under D-013.
- Bounded state: one active project; researched/work entries bounded by the
  catalog; no per-day technology or literacy history.

### 17D.8 UI and player workflow

The Technology tab shows the technology catalog grouped by era with status,
prerequisites, effects, building unlocks, enabling laws, and project progress;
education staffing split, school-age population, capacity, enrolment, attendance,
quality, funding adequacy, and month-to-date requested/shortfall; and blocked
reasons. The player can select/start research, cancel it, set the education funding
target, and set the academic research share. Previews are computed from the
immutable snapshot; all authoritative validation remains in the simulation. All
actions use the validated worker protocol; rejected actions leave state unchanged.

### 17D.9 Acceptance mapping and evidence

- **Acyclic tree validates:** load-time validator rejects ids, keys, unknown/self/
  repeated/cyclic/later-era prerequisites, work, and effects. Evidence:
  `m9-technology.test.ts` definition cases.
- **Tech progress occurs only from assigned work:** work requires staff, share, and
  funding; tests show each zero case yields zero work and that cancellation retains
  project work. Evidence: the research-progress and cancel tests.
- **Unlocking technology measurably changes systems:** productivity raises physical
  output, mortality lowers deaths, a gated building is rejected before research and
  accepted after, and a gated education law is blocked until research. Evidence:
  the effect tests.
- **Literacy outcomes match the test scenarios:** age-specific gains, adult
  aggregate stability, zero funding/staff blocking, ageing/migration integration,
  and education-law attendance effects. Evidence: `m9-education.test.ts`.
- **Worker/protocol/snapshot:** `m9-worker.test.ts` covers accepted/rejected actions,
  immutable snapshot sections, previews, and old-client rejection.
- **Determinism/serialization:** `m9-technology.test.ts` and
  `m9-education.test.ts` cover repeat hashes, save/load resumption, literacy
  round-trip, old-version rejection, and bounded state.
- **Accounting:** payroll posting balance, cash conservation, treasury credit,
  shortfall, no liability creation, and month memo reset are tested.

### 17D.10 Verification and deliberate limits

Non-benchmark typechecks, lint, the full correctness suite, and the worker-bundle
check pass; exact commands/results are in `docs/archive/gdd-change-reports/GDD_V2.13_CHANGE_REPORT.md`. Benchmarks,
performance measurements, campaigns, stress/soak runs, and device tests were
deliberately not run under the no-benchmark restriction; no existing benchmark
threshold or report was modified.

Deliberate limits:

- Urbanization is not separately modelled because the population data has no
  urban/rural split; attendance/capacity/funding/wealth/law are the modelled
  channels.
- No research material goods or operational input recipe is modelled; research is
  labour plus funding only.
- Education/research institution staffing uses the authored academic profession as
  its real people base without separate government school/research buildings; this
  mirrors the M8 administration simplification.
- No qualification promotion between professions, training, health, or social
  services; those remain E5.
- No AI research or education policy; AI-sourced actions are rejected.
- Technology tree content, work requirements, education coefficients, and initial
  research/funding inputs are provisional authored content, not historical
  calibration.
- Military technology effects and M10 capabilities are not implemented.
- Native/device verification remains under the M7 exception.

## 17E. E5 Labor and Social Institutions — implementation record

**Status:** implemented on `main` by the E5 code/tests/bundle commit and its
documentation commit. World schema **23**, simulation **0.23.0**, save format **1**,
data version **`m3-economy-v8`**, worker protocol **10**. The authoritative scope is
§17A.9, §17A.13.2 E5, §17A.14 E5, and §17.5; the material decisions and deferrals are
D-078. E5 does not implement E6 trade/monetary mechanics, M10, pensions, collective
bargaining, labour-market enforcement, cross-profession promotion, or
practitioner-level medical staffing.

### 17E.1 Scope and instrument status

| §17A.9 instrument | Status |
|---|---|
| Vocational training and qualifications | **Implemented.** Funded academic instructors, capped part-time participation, treasury-limited provider payroll and trainee stipend, daily qualification gains, and actual wage/productivity effects. |
| Public health | **Implemented with a documented simplification.** A player-set share of the existing administration clerk base delivers public-health service; derived service output lowers mortality; administration staffing and quality fall by the same share. |
| Minimum wage | **Implemented.** A labor-slot law sets a full-time annual floor; the daily wage obligation is the greater of the profession wage and the floor, prorated by the hours factor and multiplied by the qualification premium. Employer cash still limits payment. |
| Working hours/standards | **Implemented.** A labor-slot law sets a statutory week; capacity and daily wages scale with the hours factor and a bounded mortality improvement applies. It is not a free productivity bonus. |
| Public-health law | **Implemented.** The health slot sets a minimum staff share enforced on the player action. |
| Welfare transfers | Existing E2 single budgeted per-capita transfer; unchanged. |
| Migration policy | Integrated through the M8 trade law, which already sets `Country.immigrationOpen`; no duplicate action. |
| Pensions/social insurance | **Deferred.** No contribution, eligibility, benefit, or liability model exists. |
| Collective bargaining | **Deferred.** M8 organisation/influence is aggregate politics, not bargaining coverage. |
| Labour-market information/enforcement | **Deferred.** Requires a distinct placement/enforcement service. |

### 17E.2 Authoritative state

- `Country.labor`: annual training budget, annual stipend per trainee, academic
  training staff share, monthly training participation, last update day, and
  month-to-date requested/shortfall memo.
- `PopBlock.qualification`: authoritative 0..1 vocational qualification over the
  block's working-age people. Initialised to zero because no source-backed
  qualification series exists; built only by funded training.
- `Country.institutions.healthStaffShare`: 0..1 share of the administration clerk base
  assigned to public health. Administration staffing is net of it.
- `LawDef.laborMinimumWageRUSDPerYear`, `LawDef.laborHoursPerWeek`, and
  `LawDef.healthStaffFloor`.
- Training payroll/stipend accounts and posting kinds; optional training expense and
  budget memo fields.

Derived values — instructor count, participation, training quality, health staffing,
health service output, hours factor, qualification wage/productivity factors, and
mortality factors — are recomputed from authoritative state and definitions. They are
not a second authority.

### 17E.3 Training and qualification channel

- Instructors are actual available academic workers times
  `trainingStaffShare`. M9's teaching staff is
  `availableAcademicWorkers × max(0, 1 − researchShare − trainingShare)`, so research,
  teaching, and training compete for the same people and `researchShare +
  trainingShare > 1` is rejected.
- Monthly participation is set only on the first civil day (and the scenario start
  day): `capacityTrainees = floor(instructors × traineesPerInstructor)`;
  `participation = min(cap, capacity / eligibleWorkingAge)` when the budget is
  positive, instructors exist, and eligible people exist; otherwise zero.
- Eligibility requires adult literacy at or above the training threshold. Training is
  part-time and in-service; participants remain employed, and effective labour input
  is reduced by `trainingTimeShare × participation`. No person is double-assigned.
- Daily qualification gain is
  `dailyGain × participation × quality × fundingAdequacy × (1 − qualification)` for
  eligible blocks. Quality combines funding adequacy, academic literacy, and
  administration quality. No funded payroll means no gain.
- Qualification raises daily wages by `1 + wagePremium × qualification` and building
  capacity by `1 + productivityPremium ×` the assigned workers' weighted qualification.
  It does not change profession membership or literacy.

### 17E.4 Public-health channel

- Health staff = administration clerk population × health staff share; administration
  staff = the remainder. The health share therefore has a real administrative-capacity
  cost.
- Health staffing coverage is health staff per resident divided by the target;
  funding adequacy reuses the administration funding benchmark; quality combines
  staffing, funding, and literacy. Service output = quality × staffing coverage.
- Mortality factor = `1 − maxReduction × serviceOutput`, applied in the demography
  phase together with the technology and hours factors. The population consequence
  accumulates over months/years; no immediate population jump.
- The health service is paid from the existing administration payroll. No second
  payment, new profession, or duplicate people are created. A health law can impose a
  minimum share.

### 17E.5 Labor/health laws and timing

- `labor-minimum-wage` sets a full-time annual floor. The daily obligation uses the
  greater of the profession base wage and the floor, scaled by hours and the
  qualification premium. Employers pay from operating cash; unpaid wages remain the
  existing explicit shortfall.
- `labor-hours-standards` sets a statutory week relative to the provisional 60-hour
  baseline. The hours factor scales capacity and daily wages, so shorter hours reduce
  output and household income; it also applies a bounded mortality improvement.
- `health-public` sets a minimum health staff share. The player action cannot go below
  the enacted floor.
- All three use `propose-law` and the M8 support/regime/prerequisite/effective-day/
  bounded-transition pathway. Effects are read forward from the effective day; a
  closed period is never rewritten.
- The M8 trade law remains the migration border-policy path. E5 adds tests but no
  duplicate border action.

### 17E.6 Phase order and accounting

The day order is: politics (including monthly institution refresh with health netting)
→ E5 labor month start → AI → demography (technology × health × hours mortality) →
employment → migration → market/production (hours, qualification, training time cost)
→ settlement (minimum wage, hours, qualification premium) → fiscal → E5 training
phase → M9 education/research → industrial/business-tax/construction/debt → needs/
unrest/wealth/close.

The training phase runs after fiscal so it sees post-fiscal treasury cash. Two
cash-neutral postings use `training-expense` (country) and `training-income`
(household):

- `training-payroll`: country expense debit / treasury credit; academic household cash
  debit / training-income credit.
- `training-stipend`: country expense debit / treasury credit; trainee household cash
  debit / training-income credit.

Both are limited by actual treasury cash above the reserve target; the unpaid request
is a month-to-date shortfall, never debt. Fiscal totals add optional
`trainingExpenseRUSD`; budget totals add optional requested/shortfall fields. The
monthly memo resets on the first civil day. Participation is set monthly, so retrying a
day cannot re-enrol or double-pay; qualification gains and postings apply once per
processed day.

### 17E.7 Snapshot, protocol, data, and persistence

- Worker protocol **10** adds `set-training-budget`, `set-training-stipend`,
  `set-training-staff-share`, and `set-health-staff-share` DTOs.
- The country snapshot adds an immutable labor section: training policy/participation/
  instructors/eligible population/trainees/memo, weighted qualification average, health
  share/staff/administration staff/service output/mortality factor, and statutory
  minimum wage, hours, and hours factor, with blocked reasons. Previews are explicitly
  estimates; authoritative validation stays in the worker.
- Data version **`m3-economy-v8`** adds the health-public, minimum-wage, and
  hours-standards law definitions. Scenario E5 policy inputs default to neutral zero,
  so the historical M8/M9 trajectory is not silently rewritten. Generated worker
  scenario and app bundle are regenerated.
- Schema 23 / simulation 0.23.0 / protocol 10 / data v8 reject older saves and
  protocol-9 clients under D-013; no migration is implemented.
- Bounded state: one participation rate and memo per country, one qualification rate
  per block, one health share per country; no per-day training history and no trainee
  list.

### 17E.8 UI and player workflow

A Labor tab shows the actual training state (participation, instructors, eligible
people, trainees, qualification average, budget/stipend, month-to-date requested/
shortfall, blocked reason), the actual public-health state (staff share, staff,
administration staff, service output, mortality factor, blocked reason), and statutory
minimum wage/hours. The player can set the budget, stipend, training staff share, and
health staff share through validated actions. Each editable section labels its
estimate separately from observed state. Labor and health laws are proposed in the
Politics tab; deferred mechanisms are labelled.

### 17E.9 Acceptance mapping and evidence

- **Immediate transfer vs slow human capital:** the training stipend changes household
  cash in the same day; qualification gains accrue daily at a low rate and raise wages/
  productivity only as they accumulate. Evidence: `e5-labor.test.ts`.
- **Real service capacity, funding, and shortfall:** participation requires funded
  instructors and eligible people; treasury cash limits payroll/stipend; unpaid requests
  are explicit shortfalls. Evidence: training phase tests.
- **Laws have model-backed effects and require M8:** minimum wage changes the actual
  wage obligation; hours change capacity/wages and mortality; health law enforces a
  minimum share. Evidence: labor-law and health-floor tests; law timing is covered by
  the M8 suite.
- **No double assignment/duplicate state:** training is part-time and uses the existing
  academic base; health uses the existing clerk base; qualification is distinct from
  literacy. Evidence: state/derivation tests.
- **Persistence and determinism:** qualification, participation, memos, and health
  share round-trip; repeated replay hashes match. Evidence: E5 save/replay test.
- **Accounting:** training postings are balanced and cash-neutral; treasury decrease
  equals paid transfers; `assertValidWorld` passes. Evidence: training-accounting test.
- **Deferrals:** pensions, bargaining, labour-market enforcement, promotion, and
  practitioner staffing are labelled and have no controls.

### 17E.10 Deliberate limits

- The historical scenario starts with zero training/health policy; the player must
  enable E5 services. Training content, trainee/instructor ratios, wage/productivity
  premiums, health coefficients, minimum wage, and hours values are provisional.
- Qualification has no source-backed historical series and no decay (retention is
  modelled as persistence). Initial qualification is zero.
- Minimum wage has no hiring/employment elasticity in E5; wages, employer cost, and
  household income are real, but job quantities are not wage-responsive.
- Public health is public-health/medical administration by clerks; hospitals,
  practitioners, and health capital are not modelled.
- No cross-profession promotion; literacy/wealth still gate profession entry.
- Pensions/social insurance, collective bargaining, labour-market information/
  enforcement, unemployment insurance, and native/device verification remain
  unimplemented/deferred.

---

## 17F. E6a implementation record (v2.15)

**Status:** implemented on branch `main`; the implementation commit and its parent are
recorded in the completion report for this revision. The authoritative scope is
§17A.8, §17A.8.1–§17A.8.3, §17A.13.2 E6a, §17A.14 E6a, and §17.5; the material
decisions are D-079. E6a does not implement E6b monetary foundations, FX settlement,
inflation measurement, credit creation, or M10.

### 17F.1 Scope and instrument status

| §17A.8 instrument | Status |
|---|---|
| Inter-market goods trade | **Implemented.** Post-clearing domestic surplus is consigned to another market when the destination price covers origin value, freight, duty, and a provisional margin. |
| Transport cost and capacity | **Implemented.** Authored routes with distance and base capacity; effective capacity = base × weighted mean of both markets' infrastructure; freight = quantity × good transport cost × distance; transit = ceil(distance) days. |
| Customs boundary and tariff | **Implemented.** `Market.customsCountryId` defines the frontier; ad-valorem duty by good on the origin-market cargo value of a shipment between different administrations; paid once at dispatch to the destination treasury. |
| Import quota | **Implemented.** Monthly physical ceiling by good per customs administration with a deterministic month-to-date counter. |
| Export restriction | **Implemented.** Per-good prohibition on exports by that country's own buildings. |
| Balanced trade postings | **Implemented.** `trade-freight` and `customs-duty` (plus an owner capital injection when the enterprise cannot fund its own charges) are validated, cash-neutral, and posted in one atomic batch. |
| Trade agreements / market access | **Deferred.** Requires partner identity and a diplomacy/foreign-relations interface; not faked as a modifier. |
| Export incentives | **Deferred.** Requires the E4 incentive/investment machinery; no free transfer is created. |
| Non-simulated rest-of-world sector | **Deferred.** Would need externally endowed goods and cash without a modeled source; E6b owns external accounts and FX. |
| Infrastructure construction/investment | **Deferred.** E6a supplies the transport model; §17A.13.2/§17A.14 E6a do not require building infrastructure, and §17A.6.2 keeps it outside E3. |
| FX conversion / external accounts | **Deferred to E6b.** Every price and account is RUSD, so no currency transaction is required. |

### 17F.2 Authoritative state and phases

- `World.trade`: `enabled`, validated `routes` (canonical market pair, distance, base
  capacity), bounded in-transit `shipments`, `nextShipmentId`, `lastDispatchDay`, and a
  bounded `lastDay` report (dispatched, arrived, freight, duty, owner-funded working
  capital, blocked reasons).
- `Market.customsCountryId`: the market's customs administration (null only in
  countryless legacy worlds; otherwise a country that owns at least one member region).
- `Country.trade`: tariff rates by good, monthly import quota by good, month-to-date
  quota usage, export restrictions by good, last-update day, and a month-to-date
  exports/imports/duty/freight memo.
- `GoodDef.transportCostPerUnit` is populated for the sample catalog as a provisional
  fraction of each good's base price.

The day order is: politics → labor month start → AI → demography → employment →
migration → **trade arrivals** → market clearing and settlement → fiscal → **trade
dispatch** → training → education → subsidy → business tax → construction → debt →
needs/unrest/wealth/close. Arrivals must precede clearing so imported lots are sellable
the day they land. Dispatch must follow the fiscal phase because the fiscal phase
requires the settlement posting boundary to be unchanged; its postings are still in the
open period and before the monthly close.

### 17F.3 Trade mechanism

- After clearing, a building's remaining domestic lot is real surplus. Dispatch runs
  over routes in ascending id, both directions, and goods in ascending id. A shipment
  is considered only when the destination price covers
  `(origin price + freight/unit + duty/unit) × (1 + TRADE_MIN_MARGIN_RATE)`.
- Quantity is capped by the origin lot, the route's remaining daily cargo-value
  capacity, the destination administration's remaining monthly quota, and the
  enterprise's plus owner's available cash. A zero result records one bounded blocked
  reason (`stock`, `capacity`, `quota`, `export-restricted`, `margin`, `funding`).
- Dispatch removes the cargo from the origin lot immediately and holds it in
  `TradeState.shipments`. Goods in transit are in no market's stock, so they cannot be
  counted in two places. Arrival removes the shipment and adds exactly one destination
  lot owned by the shipping building; repeating the arrival phase cannot duplicate it.
- Trade is producer consignment: the seller keeps ownership and sells at the destination
  market price. No merchant entity, order book, purchase payable, or rest-of-world
  endowment is created.
- Freight and duty are paid from real enterprise cash. If the enterprise cannot cover
  the charges, its owner funds the shortfall as an explicit, balanced capital injection
  (`owner-capital-injection`) from the owner's actual cash; if the owner cannot, the
  shipment is not made. No loan, receivable, or negative balance is created.
- Cross-market lots (owned by a foreign building) are legitimate only in trade-enabled
  worlds and only as arrivals; scenario-authored stock must still belong to a building
  inside its market. Clearing, settlement, storage overflow, and ownership rules apply
  unchanged to imported lots.

### 17F.4 Accounting and reporting

- `trade-freight`: building `freight-expense` debit, `operating-cash` credit,
  `system-reserve-cash` debit, `system-income` credit.
- `customs-duty`: building `customs-duty-expense` debit, `operating-cash` credit,
  destination `treasury-cash` debit, `customs-duty-revenue` credit.
- `owner-capital-injection`: building `operating-cash` debit, building `owner-equity`
  credit, owner cash credit, owner `owner-equity` debit.
- All three are cash-neutral. Period and annual fiscal totals add
  `customsDutyRevenueRUSD`; it increases `netFiscalResultRUSD`. Duty is reported only
  when a shipment actually incurred and settled it. The customs account is created only
  in trade-enabled worlds, so pre-E6a fixtures keep their accepted account sets.

### 17F.5 Determinism, persistence, and compatibility

- Ordering is explicit (route id, direction, good id, seller building id); there is no
  random draw, `Date`, wall clock, or shared PRNG stream. A repeated dispatch for the
  same day is an idempotent no-op that cannot double-post freight/duty or double-ship,
  and the phase restores trade state, country policy/memo, and market lots if any step
  fails.
- Bounded state: at most 512 in-transit shipments and 64 blocked diagnostics per day;
  routes are bounded by the authored market pairs; there is no per-day trade history or
  order book. Snapshots retain at most 24 shipments and 24 blocked reasons.
- World schema **24**, simulation **0.24.0**, worker protocol **11**, data version
  **`m3-economy-v9`**. Older saves and protocol-10 clients are rejected under D-013; no
  migration is implemented. The generated scenario and worker bundle are regenerated.

### 17F.6 UI and player workflow

A Trade screen shows the observed transport network (routes, distance, transit days,
derived capacity, market infrastructure and customs administration), the current
in-transit consignments, the last processed day's dispatches/arrivals/freight/duty/
blocked reasons, the country's administered customs frontier, and month-to-date
exports/imports/duty/freight. The player edits a per-good tariff percentage, monthly
import quota, and export ban and applies them through the validated worker action. Each
editable section labels its preview as an estimate and states that it never guarantees
dispatch or delivery. A country that administers no customs frontier is told
explicitly that its tariff schedule cannot be collected there.

### 17F.7 Acceptance mapping and evidence

- **Real trade before controls:** dispatch/arrival/inventory/transit tests use actual
  stock lots, prices, cash, and postings; a tariff cannot be applied to a world with no
  routes (the action is rejected).
- **A tariff changes landed cost, quantity, and revenue:** the same fixture with and
  without a tariff shows a lower shipped quantity, duty posted to the destination
  treasury, and customs revenue in the monthly fiscal totals, while free trade posts
  none.
- **Capacity, quota, restriction, and funding are real constraints:** each has a test
  that observes the smaller or absent shipment and the explicit blocked reason.
- **Balanced postings and conservation:** freight/duty/injection are cash-neutral;
  goods leave one market, exist only in transit, and arrive once; world validation
  checks the accounting identity and designated-cash conservation.
- **Determinism and persistence:** two identical runs produce the same world hash; saves
  with in-transit shipments round-trip byte-identically and older schemas are rejected.
- **Worker/UI boundary:** the action is parsed and validated at the protocol boundary;
  malformed arrays and out-of-range rates are rejected; the snapshot exposes the trade
  contract without live-world references.
- **Construction procurement:** E4 procurement still buys only from the project's own
  market, so it cannot bypass transport or customs; a customs posting structurally
  requires a shipping building and a destination country, and the procurement kind
  cannot carry the customs legs.
- **Deferrals:** agreements, export incentives, RoW endowments, FX/external accounts,
  infrastructure construction, and in-transit spoilage are labelled and have no
  controls.

### 17F.8 Deliberate limits

- Route distances and base capacities are provisioned sample content, not historical
  freight measurements; the model has no per-good weight or volume, so capacity is a
  cargo-value budget.
- The M5 sample's markets are multi-polity trade zones. Each zone has one customs
  administration, so a member polity that is not the administrator shares the zone's
  external tariff and cannot collect its own on that frontier.
- Intra-market transactions between different countries remain pooled shared-market
  clearing and are not dutiable (§17A.8.3).
- There is no merchant/importer entity, trade finance, insurance, in-transit spoilage,
  re-export/entrepôt trade, multi-hop routing, retaliation, or agreement dynamics.
- Infrastructure quality is scenario-initialised; E6a does not let the player build or
  upgrade transport infrastructure.
- Trade volume in the shipped sample is modest in the first years because opening prices
  are calibrated near the same level in every market; divergence from construction,
  migration, technology, and policy creates the profitable gaps.

---

## 17G. E6b implementation record (v2.16)

**Status:** implemented on branch `main`; the implementation commit and its parent are
recorded in the completion report for this revision. The authoritative scope is
§17A.10, §17A.10.1–§17A.10.4, §17A.13.2 E6b, §17A.14 E6b, and §17.3 M8a; the material
decisions are D-080. E6b does not implement M10, commercial banking, bank credit, a
policy interest rate, external debt, or an FX market.

### 17G.1 Scope and instrument status

| §17A.10 item | Status |
|---|---|
| RUSD convention | **Preserved.** RUSD remains the fixed unit of measurement and accounting denomination; no account or closed period is rescaled. |
| Price/inflation measure | **Implemented.** Laspeyres index over a fixed needs-derived basket, base 100 at the first processed day, market/country/world values, bounded month-end observations (24), coverage, and MoM/YoY. Measurement only; no indexation. |
| Exchange-rate state and dynamics | **Implemented.** `rusdPerUnit` keeps its direction; pegged parities change only by a bounded action with a cooldown; managed rates follow a documented bounded rule from realized trade and relative prices. |
| Monetary authority | **Implemented.** A reserve-backed currency board per own-currency country, law-gated managed regime, player-only action, bounds, timing, and account ids in state. |
| Money/credit accounting | **Implemented for the monetary base.** Reserve capitalization/withdrawal, currency issue/redemption against reserves, and revaluation are balanced and cash-neutral. No bank credit or deposits exist. |
| Convertibility and transaction effects | **Implemented.** Reserve cover vs. realized imports; suspension blocks imports in E6a dispatch with `fx-convertibility`. |
| Bank credit, deposits, policy rate, lender of last resort, external debt, FX order book | **Not implemented.** Recorded missing prerequisites; not approximated. |

### 17G.2 Authoritative state and phases

- `World.priceIndex`: the fixed basket (good, weight), each market's base prices,
  bounded month-end observations (world and per-country), and the last observation day.
- `World.monetary`: the enable flag, one record per currency (issuer country, regime,
  parity, reference parity, circulation units, explicit account ids, last parity change,
  last managed update, last month-end capture, realized month exports/imports), and the
  last update day.
- `CurrencyValuation`: the single authoritative RUSD-per-unit rate; `source` is
  `scenario | policy | market` provenance.
- Finance: six account subtypes and four posting kinds
  (`monetary-reserve-contribution`, `fx-issuance`, `fx-redemption`, `fx-revaluation`).
- Scenario: an optional `monetary` block. The historical sample enables the system but
  activates no authority because its currency valuations are explicitly unavailable.

The monetary phase runs after settlement, fiscal, and E6a dispatch and before the
monthly close: managed valuation/revaluation daily, and the realized-import capture plus
price-index observation at a civil month-end. Both are idempotent per day.

### 17G.3 Exchange-rate and money mechanics

- A pegged valuation equals its parity. A parity change is a validated player action
  bounded to a maximum relative step and a minimum interval, and it is revalued through
  explicit equity postings.
- A managed valuation changes by
  `clamp(KAPPA_FX × (w_trade × tradePressure + w_price × priceGap), ±MAX_DAILY)`, bounded
  to a band around the reference parity. `tradePressure` is the completed month's net
  external position over turnover; `priceGap` is the world/country index ratio minus one.
- The currency board exchanges RUSD reserves for currency units with an external
  counterparty (issue/redeem), bounded by reserves and external cash/holdings. Treasury
  reserve transfers are capital, not revenue or expense.
- Reserve cover is reserves divided by the completed month's realized imports. Below the
  documented minimum (or with zero reserves) convertibility is suspended; E6a dispatch
  blocks imports into that country's customs zone with `fx-convertibility`. Trade values
  remain RUSD and are never converted.

### 17G.4 Accounting, determinism, and compatibility

- All monetary postings are four-line, equal-amount, cash-neutral structures with named
  counterparts; `fx-revaluation` has no cash legs. Designated-cash conservation and the
  accounting identity hold, and a failed operation restores monetary state, valuations,
  account balances, and the posting boundary.
- Ordering is explicit (currency id, then the documented phase order); there is no
  random draw, wall clock, or shared PRNG. Observations and records are bounded and
  sorted by stable ids.
- World schema **25**, simulation **0.25.0**, worker protocol **12**, data version
  **`m3-economy-v10`**. Older saves and protocol-11 clients are rejected under D-013; no
  migration is implemented. Generated scenario and worker bundle are regenerated.

### 17G.5 UI and player workflow

A Money tab shows the currency identities and RUSD-per-unit valuations, the authority's
regime/parity/valuation/reserves/circulation/liability/cover/convertibility, the price
index definition (basket, base period, weights, coverage) and its MoM/YoY measurements,
and the bounded month-end observations. It offers one validated monetary action (regime,
parity, reserve transfer, currency conversion) with an estimate block labelled as an
estimate. The managed regime is explained as requiring the currency law, which is
enacted through the Politics path.

### 17G.6 Acceptance mapping and evidence

- **Documented inflation measure:** basket/weights/base/window/coverage tests; base-100
  normalization; weight-correct response; missing-price exclusion; bounded/idempotent
  observations; MoM/YoY availability.
- **Exchange-rate dynamics:** direction/round-trip tests; pegged bounds/cooldown; managed
  rule direction and band; law gating; AI rejection.
- **Monetary authority and balanced accounting:** opening balance sheet; reserve
  capitalization/withdrawal; issue/redemption; revaluation with no cash or goods change;
  cash conservation and the accounting identity via world validation.
- **Defined channel:** reserve-cover suspension blocks E6a imports and restoration
  resumes them; no goods are created or lost.
- **Missing prerequisites explicit:** banking/credit/policy-rate items are labelled and
  absent; no universal fiat powers; adopted currencies have no authority.
- **Persistence/determinism/worker:** world-hash determinism, save round-trip,
  previous-schema rejection, worker snapshot/action, and malformed-command rejection.

### 17G.7 Deliberate limits

- Domestic accounts, prices, wages, and trade remain RUSD; FX transmission to domestic
  prices and wages is limited to the convertibility channel and the authority's balance
  sheet.
- The sample's rates are unavailable by design; the player establishes a parity rather
  than receiving an invented historical rate.
- Managed-rule coefficients, the reserve-cover minimum, the parity step/cooldown, and the
  basket are provisional structural choices, not calibration.
- No commercial banks, deposits, credit, policy rate, lender of last resort, external
  debt, or FX market; no indexation of contracts or wages.

---

## 17H. M10 implementation record (v2.17)

**Status:** implemented on branch `main`; the feature and documentation commits are
recorded in the M10 completion report. Authoritative scope is §11, §11.1–§11.5 and the
M10 definition of done; the material decisions are D-081. M10 does not implement M11,
tactical combat, or the deferred diplomatic instruments listed in §17H.7.

### 17H.1 Sovereignty and military control (CEN-AUDIT-016)

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

### 17H.2 Authoritative state

`World.military` (disabled by default; enabled by the scenario block): bounded `armies`,
`wars`, `relations`, `peaceOffers`, per-country cumulative `casualties`, id counters, and
an idempotent `lastPhaseDay`. `Region` carries `controllerCountryId` and `occupiedSinceDay`.
Accounts: country `military-expense` and pop-block `military-income`; posting kinds
`military-pay` (treasury to the soldiers' region households) and `military-procurement`
(treasury to the system equipment supplier), both cash-conserving and structurally
validated. `FinancePeriodFiscalTotals.militaryExpenseRUSD` reports the spending.

### 17H.3 Military mechanics

- **Recruitment.** Five validated actions exist: `declare-war`, `offer-peace`,
  `accept-peace`, `recruit-army`, and `deploy-army`. Recruitment removes working-age people
  (18–45, males then females) from the region's pop blocks into the roster, apportioned
  across blocks by available eligible population with deterministic largest-remainder
  ties and per-block capacity. It charges a real signing cost to the treasury paid to the
  blocks that supplied the recruits, and buys equipment units at a documented RUSD price
  from the non-simulated system supplier. Formation takes 14 days before deployment.
- **Upkeep.** Daily pay and equipment upkeep are paid from actual treasury cash; a
  shortfall pays pro rata, never creates money, and erodes supply/organization. Soldier
  pay is distributed across the army region's households by eligible population;
  equipment upkeep is paid to the system supplier.
- **Combat.** Hostile armies in the same region fight daily. Strength derives from
  personnel, equipment coverage, organization, and supply. Casualties are deterministic
  from the keyed `m10-combat` RNG for loss magnitude; the loss is split into deaths,
  wounded (return after 30 days), and captured (permanent) using the configured
  0.4/0.45/0.15 shares and deterministic largest-remainder arithmetic. Equipment is lost
  with casualties. When an army is destroyed, its wounded return to the home region's
  population by the same population-proportional rule.
- **Occupation.** A hostile army in an undefended at-war region occupies it: control
  changes, daily unrest rises by 0.002, and the occupier pays a garrison cost into the
  occupied region's households, distributed by eligible population. A sovereign army that
  removes the occupier liberates it. No cash, building, person, market, or monetary record
  moves.
- **Peace and truce.** A belligerent offers white peace or cession of controlled regions;
  the other belligerent accepts. Acceptance ends the war, clears occupations, records the
  truce, and applies cession if chosen. Cession is rejected if it would remove the ceding
  country's last sovereign region, and it is revalidated against current occupations at
  acceptance. A peace on day P creates 365 full truce days P+1..P+365: the inclusive last
  prohibited day is P+365, and a new declaration is first legal on P+366. AI countries
  accept a pending white peace deterministically after 120 war days or when they control
  fewer enemy regions than they have lost; AI does not declare war or recruit.

### 17H.4 Integration

- **Fiscal/accounting:** military postings are ordinary balanced, cash-neutral journal
  entries in the open period, included in monthly and annual totals. Occupation moves no
  treasury and forces no transfer. All existing invariants (identity, designated cash,
  closed periods) still hold, verified in tests.
- **Population:** civilian population, army personnel, wounded, captured, and military
  deaths reconcile exactly; the test suite asserts conservation across battles.
- **Markets/trade/customs:** membership, customs administration, shipments, and duty are
  untouched by occupation and cession. No E6a record is rewritten.
- **Monetary/FX:** the authority, parity, reserves, convertibility, and price index are
  untouched. RUSD remains the unit of account; no conversion is introduced.
- **Buildings/construction/private ownership:** unchanged by occupation or cession.
- **Laws/politics/AI:** the sovereign's laws, institutions, and unrest channel continue;
  the AI uses the same action validator and rules, with its bounded peace rule only.
- **Worker/UI:** protocol 13 adds typed DTOs and parsers for all five actions; snapshots
  expose sovereignty, controller, occupation start, armies, wars, relations, offers, and
  casualties. A War tab shows wars, peace offers, armies, recruitment, deployment, and
  territorial control, and every control calls a validated action.

### 17H.5 Determinism and persistence

Ordering is by stable ids (armies, wars, regions, countries, offers); randomness is the
keyed `m10-combat` draw with the world seed, day, war id, and region/side draw index.
Military allocation and payment distribution add the keyed
`m10-recruitment-remainder`, `m10-military-pay-remainder`, and `m10-return-remainder`
tie-breaks; these never change combat draws or iterate in pop-array/numeric-id order. The
phase is idempotent per day and bounded by `MAX_ARMIES`, `MAX_WARS`,
`MAX_MILITARY_RELATIONS`, and `MAX_PEACE_OFFERS`. Enabled military states require their
country `military-expense` and pop-block `military-income` accounts; disabled states must
carry no active military records. New state participates in canonical
serialization, hashing, save/load, and schema rejection. World schema **26**, simulation
**0.26.0**, worker protocol **13**, data **`m3-economy-v11`**; older saves and protocol-12
clients are rejected under D-013 without migration.

### 17H.6 Acceptance mapping and evidence

- **Two-country conflict end-to-end:** declaration, recruitment, deployment, battle,
  occupation, peace, and truce are exercised by `m10-warfare.test.ts`.
- **Casualties/mobilization reconcile with population/workforce:** recruitment removes real
  people; casualties are allocated and recorded; the test asserts the total is conserved.
- **Equipment and finance consumed correctly:** equipment purchase, daily pay/upkeep, and
  the fiscal totals are asserted; no free resources or per-tick grants exist.
- **Peace/territorial changes update affected systems:** cession updates sovereignty and
  `Country.regionIds` only; the test asserts markets, people, treasury, buildings, and
  valuations are unchanged, and that occupation changes control only.
- **CEN-AUDIT-016:** distinct sovereignty and control records; occupation and cession tests
  enforce the distinction across ownership, markets, buildings, population, finance, and
  monetary state.
- **Invalid actions:** self-war, duplicate war, non-belligerent peace, wrong recipient,
  truce, illegal deployment, unaffordable recruitment, and malformed protocol commands are
  rejected without partial mutation.

### 17H.7 Deliberate limits

No tactical combat, terrain/weather/fortifications, supply lines, navies, alliances,
sanctions, recognition, subject relationships, war-exhaustion meter, multi-term negotiated
peace, independence, partition, non-treaty annexation, or regime change. Movement is a
constant strategic delay rather than a route graph. AI has no war strategy, recruitment,
or deployment. Military equipment comes from a non-simulated supplier; domestic arms
production is deferred. All M10 constants are provisional and uncalibrated.

---

## 17I. M11 implementation record (v2.18)

**Status:** implemented. This section records **M11 — Historical World, Country
Selection, and Complete UI Overhaul**. It supersedes the M5 eight-polity sample
as the playable world while keeping that sample as a validated test fixture.

### 17I.1 Historical classification and the 1900 catalog

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

### 17I.2 World representation

A **state** entry becomes one simulation `Country` with a home region. A
**territory** entry becomes one simulation `Region` owned by its sovereign
country. Every state owns one home region and zero or more dependent regions.
The resulting world has **133 regions** and **67 countries**.

This representation preserves the M5 one-market-per-country invariant (a
country's home and dependent regions share one market) and avoids treating a
colony as an independent country. It also means a territory can be clicked on
the map and resolved to a real `regionId`, while its sovereign remains the
country that owns it. D-081 remains intact: sovereignty is `Country.regionIds`;
occupation is `Region.controllerCountryId` and never changes ownership or market
membership.

Every region has population blocks, buildings, an owner, and a market. Every
country has a treasury, fiscal policy, debt policy, government, laws, technology,
currency, and an AI/player control assignment. All ordinary world validators
pass, including population totals, age-cohort expansion, building ownership,
employment eligibility, market membership, account balance, and conservation
invariants.

### 17I.3 Historical accuracy and estimation

The world is a documented historical abstraction, not a census:

- Population totals are rounded estimates from OWID and Maddison 2023. Each
  catalog entry records a confidence level.
- Occupation composition, literacy, urbanisation, wealth and militancy are
  authored provisional allocations informed by broad sector reconstructions.
- Building levels, treasury, fiscal settings, technology starts, market grouping
  and trade routes are provisional calibration parameters.
- The 1900 world represented here totals roughly 1.52 billion people against the
  M2 world estimate of about 1.62 billion; the difference is unrepresented or
  grouped territory, not a claim of completeness.

All of these are labelled provisional in the UI and in the historical source
notes. No synthetic economic value is presented as measured 1900 data.

### 17I.4 Country selection and player identity

At the beginning of a new campaign the player passes through:

1. main menu;
2. new game;
3. historical date/scenario confirmation;
4. interactive world map and country selection;
5. selected-country detail panel;
6. confirm selection;
7. validated campaign initialization;
8. the main game shell.

The worker protocol adds `CREATE_GAME { playerCountryId }`. The host validates
that the id is a registered country and that its catalog metadata is
`selectable`; unknown countries and dependencies are rejected explicitly. A new
campaign is a fresh `createEconomyWorld` with the selected `playerCountryId`, not
a first-array or "country 0" default. The selected id is part of authoritative
world state (`World.playerCountryId`), is serialized with the save, is validated
on load, and is re-created after a worker restart. The country AI skips the
player country in every evaluation.

The picker supports search by historical name, common name, capital or tag;
continent filters; a playable/all-territories filter; a list view; map selection;
and a detail panel with status, parent, capital, market, population, description
and the explicit reason a dependency cannot be played. Map and list selection
are the same state and the selected country is highlighted.

### 17I.5 Market identity

A market is an economic grouping, not a country. The catalog authors **18
markets** with display names, kinds and descriptions derived from their actual
membership:

- imperial markets (British Empire and Sterling Area; United States and Insular
  Possessions; German Empire and Colonial Market; French Empire and Colonial
  Union; Russian Imperial Market; Dutch Empire Market; Belgian and Congo Market;
  Ottoman–Egyptian Market; Japanese Empire Market);
- shared multi-country markets (Iberian and Colonial Market; Alpine Customs
  Union; Northern European Market; Mediterranean and Colonial Market; East Asian
  Treaty Port Market; Persian Gulf and Himalayan Market; African Independent
  States Trade Area; Southern African Market; Latin American Trade Area).

The snapshot exposes `MarketSnapshot.name`, `description`, `kind`,
`memberCountryIds`, `regionIds`, the customs administration and prices. Market
screens list every member country and region, distinguish the customs
administration from sovereignty, and offer a map highlight action. The numeric
market id is shown only as secondary diagnostic text. The snapshot builder never
falls back to `Market N`: without authored metadata it derives a name from the
member countries.

### 17I.6 Historical world map

The map is bundled, offline and interactive:

- Geometry source: **Natural Earth 1:50m/1:10m** cultural vectors, public
  domain, through **world-atlas 2.0.2** TopoJSON (ISC) and 1:10m admin-1
  reconstruction blocks. Modern units are only building blocks; the authored
  M11c transfers in `boundaries_1900.json` reconstruct the 1900 external
  borders. South Africa is split into the Cape Colony, Natal, the Transvaal and
  the Orange Free State using admin-1 provinces. Newfoundland is separated from
  Canada. Every polity carries boundary provenance, confidence and a reference
  date. See §17I.14 and `docs/HISTORICAL_MAP_PROVENANCE.md`.
- CShapes 2.0 is **not redistributed**: it is CC BY-NC-SA 4.0 and is cited only
  as a classification reference. historical-basemaps (GPL-3.0) was reviewed and
  is used only as a visual/topological cross-check; no coordinate ring from it
  is redistributed.
- Polygons are unioned with `polygon-clipping` (MIT) at build time, simplified to
  a 0.02° tolerance, quantized to 0.001°, delta encoded, and unwrapped at the
  antimeridian. The renderer draws each ring at −360/0/+360 offsets.
- Projection: Gall stereographic cylindrical, implemented in app code (x is
  linear in longitude, so the antimeridian offsets are exact). M11 used Miller
  cylindrical; D-111 records the change.
- Layers: political sovereignty, military control/occupation, market
  membership, selection. Occupation is a translucent, dashed control overlay
  using the controller's colour; the sovereign fill remains underneath.
- Interaction: pan, wheel/buttons/pinch zoom, tap selection, hover tooltip on
  web, capital markers, small-state markers, labels by zoom, legend.
- The map identifies authoritative country/region ids: a polity entry's id is
  its country id (states) or its region id (territories), and dynamic ownership
  is read from the snapshot so a treaty cession recolours the territory.

### 17I.7 Slider-first controls

Continuous numeric player controls use a reusable `SliderField` with a paired
editable numeric value, current value, min/max, step, unit, threshold ticks, live
preview and a pending indicator. It supports mouse, touch, keyboard step buttons,
the platform's accessibility increment/decrement actions, and precise typed
entry. Rapid commits are coalesced by `useDeferredCommit`: one action is in
flight at a time and the latest value wins, so a drag cannot deliver a stale
value over a newer one.

The inventory of numeric inputs, ranges, units and exceptions is
`docs/M11_SLIDER_INVENTORY.md`. Categorical selections (laws, technologies,
buildings, regions, markets, dates, speed, booleans) deliberately remain
non-slider controls.

### 17I.8 Interface redesign

The app shell is redesigned around the map:

- **Main menu** with a map hero, campaign card, world statistics and provenance.
- **New-game brief** confirming 1 January 1900 and the modelled systems.
- **Country selection** as a three-pane map/list/detail workspace, collapsing to a
  stacked layout with map/list panes on narrow screens.
- **Game shell** with a top bar (country emblem/name, status, capital, date, key
  indicators, speed, save/load), a grouped navigation rail on wide screens and a
  horizontal bar on narrow screens, and a map-first World screen with a
  contextual polity panel.
- **Design system**: centralized typography, atlas palette, spacing, panels,
  buttons, chips, badges, dividers, notices, metrics, progress bars, sliders and
  map legend. Screens consume the same components rather than styling
  independently.
- **Country identity**: the historical name, common name, tag, status, capital
  and sovereign are shown; a numeric country id is never the player-facing
  identity.
- Screens cover Overview, World, Budget, Markets, Industry, Construction, Trade,
  Labor and health, Money, Population, Politics, Technology, War and diplomacy,
  and the Ledger. Only implemented systems have navigation entries.

Responsive layouts are desktop/tablet (rail + columns) and narrow (stacked,
horizontal navigation, map 300–320 px tall). Native export was not re-verified
in this milestone; web export is the verified target.

> **Superseded by D-112 (Living Atlas).** The game runs in landscape on every device.
> iOS and Android are primary, the map is always the screen, and every screen opens as
> a sheet over it, in four domains: Realm, Economy, Society and World.

### 17I.9 Contracts, state and versioning

- `EconomyScenarioDef` gains optional static `countryMeta`, `marketMeta` and
  `regionMeta` arrays. They are scenario content and are **not** serialized with
  the world, so no world-schema change is required.
- `SimulationSnapshot` gains `countrySummaries`, `focusCountryId`, country
  `meta`, region `meta`, and market identity fields. Full `CountrySnapshot`
  detail is bounded to the player country and one focused country. This is
  required by the world size: a full detail record is roughly 35–40 KiB, so 60
  full records would exceed 2 MiB per snapshot. The bounded snapshot is about
  200 KiB.
- Worker protocol **14** adds `CREATE_GAME`, `SET_FOCUS`, and
  `NEW_GAME_RESULT`. Older clients are rejected under D-013.
- World schema remains **26**; save format **1**; simulation **0.27.0**; data
  **`m3-economy-v12`**. The scenario id is `m11-world-1900`; pre-M11 saves are
  rejected by the scenario-id check.
- The app uses a generated `worldCatalog`/`worldMap1900` module for the pre-game
  picker. It is a build artifact of the same authored catalog, not a second
  hand-maintained source; all runtime identity and mutable values come from the
  snapshot.

### 17I.10 Determinism and invariants

- World creation is deterministic for a given seed, scenario and player country.
- `CREATE_GAME` validates and then constructs a fresh world; it does not mutate
  the previous world in place.
- AI evaluation excludes the player country.
- Saves preserve the player country and the full world; load re-attaches static
  metadata from the current scenario and rejects incompatible ids/versions.
- No account, population, goods, or employment invariant is weakened. Market
  stock lots are bounded by actual warehouse capacity; regional supply is scaled
  from the calibrated sample ratios, not hardcoded per country in simulation
  code.

### 17I.11 Acceptance mapping

| Requirement | Evidence |
|---|---|
| Catalog based on a documented definition and date | catalog `meta.classification`, 1 Jan 1900 |
| Every qualifying independent state playable | 66 selectable states; M11/M11b tests check creation for every selectable country |
| Dependencies accurate and non-playable | 66 territories; all `selectable: false`; Cuba/Egypt statuses |
| Every selectable country has a valid starting state | `m11-world.test.ts` world validator over 133 regions |
| Country selection maps to the right country | `CREATE_GAME` test across USA/JPN/ZAR/BRA/RUS/ETH |
| AI control for non-player countries | AI phase test: player `lastDecisionDay` stays null |
| Player identity survives save/load and restart | serialize/deserialize test; host re-create effect |
| Map renders, selects, and handles the seam | geometry test; pan/zoom component; antimeridian offsets |
| Sovereignty and occupation distinct | control overlay; snapshot sovereignty/controller fields |
| Market names and complete membership | market test: no `Market N`, membership checked |
| Sliders reach authoritative actions | range test over fiscal/funding/training/trade actions |
| UI shell, navigation, responsive layout | GameShell, selection screen, design system |
| No dead navigation or fake buttons | navigation maps only to implemented screens |

### 17I.12 Deliberate limits

- The M11 map aggregated modern source units into 1900 polities. **M11c (§17I.14)
  supersedes those limits:** Congress Poland is separated from the German Empire
  and remains Russian; Alsace-Lorraine is separated from France; Austria-Hungary
  includes reconstructed Galicia, Transylvania, Vojvodina and South Tyrol;
  Tibet is separated from Qing China; and Sokoto, Wadai, Darfur, Jabal Shammar,
  Crete, Tonga, Khiva, Bukhara and Sarawak have reconstructed polygons. The
  remaining limits are the documented frontier approximations in
  `docs/HISTORICAL_MAP_PROVENANCE.md`, not the original admin-0 aggregation.
- The world population total is about 1.59 billion, closer to but still below the
  1.62 billion M2 estimate; it is not a claim of census completeness.
- The one-market-per-country rule means imperial markets include dependent
  territories; market membership is not a sovereignty claim.
- Native iOS/Android export and device verification were not re-run for M11.
- Benchmarking/profiling was prohibited for this milestone; tick cost at the full
  world size is therefore reported only as a bounded smoke observation, not a
  benchmark.

### 17I.13 M11b catalog-coverage addendum

**Status:** implemented. M11b reconciles the 1900 catalog against a full
independent-state inventory and closes the known coverage gaps:

- **Austria-Hungary** is one catalog state (ID 60), not two independent
  countries. Its notes record the Austrian and Hungarian halves, the joint
  foreign/defence/finance ministries, the separate parliaments and the joint
  administration of Bosnia. Co-capital Budapest is recorded. Its flag is the
  common civil ensign, because no single unified national flag existed.
- Six independent states were added: Austria-Hungary, Tonga, Sokoto, Wadai,
  Darfur and Jabal Shammar. Crete was added as an autonomous-vassal state.
  Tibet, Khiva, Bukhara and Sarawak were added as non-selectable territories.
- The final catalog is **67 states**, **66 territories**, **133 regions**,
  **20 markets** and **66 selectable states**. Existing IDs were not renumbered.
- The five M11 monogram cases (Spain, Spanish Sahara, Spanish Guinea, Montenegro
  and the Transvaal) are resolved with period flags or original project-authored
  reconstructions. Only Wadai and Darfur remain documented monogram exceptions.
- The full inventory, contested classifications, sources and remaining
  boundary uncertainties are recorded in `docs/1900_CATALOG_COVERAGE.md`. Flag
  provenance and the project-authored reconstruction audit are in
  `docs/FLAG_PROVENANCE.md`.

### 17I.14 M11c historical geography and border-reconstruction addendum

**Status:** implemented. M11c replaces the "modern units only" map assumption
with an explicit historical reconstruction and a documented audit:

- **No modern border by default.** Modern Natural Earth units are building
  blocks only. Every 1900 difference is an authored transfer in
  `packages/data/data/historical/m11/boundaries_1900.json` with dated sources,
  confidence, geometry class and uncertainty. Transfers are clipped to their
  source polities and applied with `polygon-clipping`; residual overlaps are
  resolved deterministically.
- **Germany is the German Empire.** Alsace-Lorraine, North Schleswig,
  Eupen-Malmedy, Memel, East Prussia/Kaliningrad and the Prussian eastern
  provinces are added; Congress Poland and Austrian Galicia are excluded. The
  eastern frontier strip is MEDIUM confidence.
- **Libya is Ottoman, except the Aouzou–Tibesti frontier zone.** The modern
  Libyan outer frame is assigned to the Ottoman Empire (OTT). The Aouzou–Tibesti
  zone is excluded from both OTT and FEA and represented as a map-only
  disputed/no-established-administration area; 1899 was a sphere-of-influence
  line, not effective administration, and the 1935/1955 instruments are not
  retroactive. The provenance records Tripolitania, Cyrenaica and Fezzan as
  separate components with the limits of Ottoman administration and effective
  control. No independent `LBY` state is added.
- **No marker-only polities remain.** Tonga, Sokoto, Wadai, Darfur, Jabal
  Shammar, Crete, Tibet, Khiva, Bukhara and Sarawak have reconstructed polygons;
  their stable IDs and simulation entries are unchanged.
- **Provenance is part of the map.** Every map polity carries its reference
  date, sources with URLs/licences, geometry class, confidence, deviations from
  the modern map, known uncertainties and transfer ids.
- **Audit and tests.** `scripts/m11/audit-map.mjs` generates
  `world_map_1900_audit.json`; `m11c-geography.test.ts` verifies catalog/map/
  provenance coverage, Germany, Libya, the global historical test points, ring
  validity, the two documented coastline slivers and the absence of
  multi-sample land voids. The detailed table is
  `docs/HISTORICAL_MAP_PROVENANCE.md`; the map pipeline is `docs/MAP_DATA.md`;
  the material decision is D-096.
- **Residual uncertainty.** Two overlaps above 0.001 deg² remain
  (Canada/Newfoundland 0.249 deg², Bolivia/Brazil 0.016 deg²) and 24
  single-sample 1° coastal/island samples remain unassigned. These are
  generalization artefacts, not missing polities. No multi-sample terrestrial
  void remains; the Libyan void is gone.

### 17I.15 M11c.1 corrections, rendering and zoom addendum

**Status:** implemented. M11c.1 corrects the Aouzou classification, resolves the
two residual overlaps, raises the coverage audit resolution, fixes the stale
land-layer rendering bug and raises the maximum zoom.

- **Aouzou–Tibesti** is a map-only `disputed-no-established-administration`
  zone, removed from both FEA and OTT. The 1899 Anglo-French Declaration was a
  sphere-of-influence line; the ICJ record and later instruments do not support
  effective French administration in 1900. Ottoman claims, Toubou local
  authority and the lack of a surveyed frontier are recorded explicitly. A
  second map-only `disputed-frontier-unsettled` zone covers Karakoram–Siachen.
- **Overlaps.** The Canada/Newfoundland and Bolivia/Brazil intersections are
  extracted, recorded with bbox/area/decision/source and trimmed. The Labrador
  dispute and the 1927 Privy Council line are not applied retroactively; Acre is
  Bolivian in 1900 and the Treaty of Petrópolis is not applied retroactively.
  Residual overlaps are sub-0.01 deg².
- **Coverage audit** groups land rings into outer/hole polygons and performs a
  polygon-level land-minus-assigned difference per 30×30° tile, in addition to
  the 1° sample. It reports intentional Antarctica, sub-0.02° generalization
  slivers and small-island detail gaps separately.
- **Rendering.** The land mask is inside the country transform group, uses the
  even-odd rule for inland water, and cannot paint over the ocean at a different
  zoom scale. Layer order is ocean → land → country fills → borders → selection
  → markers.
- **Zoom.** Maximum scale **18** (previous 10, 1.8×), with wheel, trackpad,
  pinch and cursor/pinch-midpoint focal zoom; bounded pan; reset to global view.
- **Flags.** Darfur and Wadai use user-selected representative flags. The Pax
  Historia rasters are not bundled because redistribution permission was not
  established; Fabric of Nations independently reconstructed the simple geometric designs
  and records them honestly as representative, not exact historical, flags. No
  monogram fallback remains.
- **Material decision:** D-097. Detailed audit and screenshots:
  `docs/HISTORICAL_MAP_PROVENANCE.md`, `docs/MAP_DATA.md`,
  `docs/FLAG_PROVENANCE.md` and `docs/images/m11c1/`.

## 17J. Prosperity Program — peacetime economy and demography (P0–P15)

**Status:** P0 (design) approved 2026-11-02. P2 (provinces, customs territories, schema
28) is implemented for review, with the money calibration moved to P2b (D-130 to D-134).
P2b (historical money and productivity, schema 29) is implemented for review on
2026-11-03 under the designer's basis decisions (D-135) and the price-rule amendment (D-136).
P3 (local-currency display, schema 30) is implemented for review on 2026-11-04 (D-141);
the designer's requirements for metal and paper money and for changing a currency
arrangement are recorded as proposed decision D-140, not yet assigned to a stage.
P4 (cause-driven demography, schema 31, protocol 20) is implemented for review on
2026-11-05 (D-142): per-block fertility and child/adult mortality levels derived from
literacy, towns, income, lagged child mortality, contraception, health services,
sanitation and calories eaten, starting from sourced 1900 levels per province; WPP is a
validation target only.
P5a (land, harvest weather, own consumption, deposits and prospecting; schema 32) is
implemented for review on 2026-11-05 (D-143); the goods catalogue moves from P6 into P5b.
On 2026-11-06 the designer accepted P3, P4 and P5a and approved the P5b plan (D-146):
the 57-good catalogue, its recipes, extraction and 1900 production, together with D-140
(money as metal and paper), which is assigned to P5b. A save storage-backend stage
follows P7, and a map-pipeline repair stage is scheduled.
P5b is implemented for review on 2026-11-07 (D-147 to D-151): 57 goods with extraction
from deposits, goods that cannot be stored, maintenance and optional inputs, a 1900
placement sized by modelled demand at sourced country shares (data `m3-economy-v13`),
gold, silver and paper currencies with a mint window and the 1900 money stocks, currency
adoption and establishment, and protocol 22. Its performance step is held by the
designer (the 1900 day is 593 ms in Node against the 450 ms budget). On 2026-11-08 it
gained province hydro potential (HydroSHEDS RiverATLAS, CC BY 4.0) capping hydro stations,
sourced cotton shares and fuel prices, and jewellery as a 58th good made by jewellers from
gold and silver (D-148, D-152), and coffee, tea and cocoa, tobacco and rubber were placed at
their recorded 1900 producers under a coverage rule, raw silk became a 59th good in the
textile recipe, and electricity and the jewellery metal share were sourced from the 1902
and 1900 censuses, and cotton and wool were calibrated to the 1900 world fibre supply
(D-148, D-152); the monetary demand for gold and silver (free coinage, a
growing circulation) is deferred to P11 (D-152).
P1 is implemented with a documented
performance shortfall: phase validation and checkpoint rollback (D-116), aggregated
market postings and one cash-capped market attempt (D-125), minimal employment repair
(D-126) and exact work-in-progress capitalization (D-127) make the 1900 world day about
3.9× faster in Node, short of the 10× target. The province-scale benchmark and the
typed-array population pool move into P2. Every later stage is assigned and accepted
separately. The detailed plan with
dependencies, tests and benchmarks is `docs/PROSPERITY_PROGRAM.md`; decisions are
D-115 to D-124. Until a stage is accepted, the earlier sections remain the current
implementation.

### 17J.1 Objective

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

### 17J.2 Binding foundational rules

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
4. **Integrity (D-116).** Each phase validates its preconditions; cheap global
   invariants run daily; full validation runs at month end, on load/save/actions and
   in tests. A failed day is rolled back to its start through checkpoint and
   deterministic replay; no partial day is ever accepted, and no subsystem can be
   restored separately from the others.
5. **Demography (D-124).** Fertility and mortality levels are caused by simulated
   conditions; historical series are calibration and validation targets only.
6. **Money (D-122).** RUSD is the simulation unit with the purchasing power of a
   1990 US dollar. Players see their own currency, or a chosen display currency,
   converted at display time. RUSD is for the simulation; local currency is for the
   player.
7. **Saves (D-120).** The schema break is accepted; older saves are listed as
   incompatible with the reason and are never deleted or overwritten automatically.
8. **Data (D-121).** HYDE 3.3 distributes population and land within countries;
   USGS deposit data plus authored historical fields place resources; provenance,
   version, coverage and limitations are documented.

### 17J.3 Stages

| Stage | Scope | Principal acceptance |
|---|---|---|
| P0 | Design, GDD v2.19, decisions D-115–D-124, plan, companies proposal | Designer approval (given 2026-11-02) |
| P1 | Performance foundation: world-scale benchmarks, hot-path fixes, phase validation and checkpoint rollback, typed-array population pool | Identical hashes on all fixtures and 365 days of the 1900 world; ≥10× faster 1900 world day in Node; province-scale synthetic world measured; rollback tests |
| P2 | Provinces replace regions; customs territories; generated trade routes; HYDE province data; schema break | No region layer remains; conservation through province transfer; national tariff schedules; all selectable countries initialise; province panel and lenses on phone |
| P2b | Historical money and productivity calibration: every money value re-derived from a 1900 source and converted to 1990 dollars; per-country wage levels (D-130) | Every value traces to a source row; before/after report against sources |
| P3 | Local-currency display and display-currency choice | All money labels formatted through one converter; display choice changes no world hash |
| P4 | Cause-driven demography, urban/rural split | Country-specific 1900 levels; transition caused by literacy/urbanisation in isolating fixtures; WPP comparison report |
| P5 | Land, diminishing returns, own consumption, harvest variance, deposits and discovery | Falling marginal product; famine only through food shortfall; deposit conservation |
| P6 | Goods catalogue (~22), Engel/LES demand with substitution, saving, housing | Food share falls with income; housing conservation |
| P7 | Labour market, wages, nine professions, mobility, urbanisation | Agricultural share falls in a growing no-input economy; people conserved |
| P8 | Railways, roads, ports; provincial transport wedge on the national price | Railway raises farm-gate prices in its province; wedge is real freight cost |
| P9 | Companies and company finance | Consolidation equals building sum; dividends conserve cash |
| P10 | Private investment, expansion, contraction, closure, bankruptcy | Tariff fixture raises protected-sector investment; bankruptcy conserves assets |
| P11 | Banks, deposits, loans, bonds, emergent interest rate | Bank balance-sheet identity; default path |
| P12 | State and mixed ownership, nationalisation, privatisation | Ownership shares conserved; compensation balances |
| P13 | Exchanges, share trading, market capitalisation, mergers | Shares and cash conserved; bounded deterministic prices |
| P14 | Story layer: causal report, events, goals, history, AI levers | Scripted no-war playtest produces distinct causal stories |
| P15 | Hundred-year calibration against Maddison, urbanisation, sector shares, e0, TFR | Documented tolerance bands met or deviations explained |

### 17J.4 Rollback mechanism (P1)

The runner keeps a last good checkpoint, taken at month start and before each
accepted action, and a journal of accepted actions since it. A failing phase aborts
the day; the runner restores the checkpoint, replays to the start of the failed day,
checks the replayed world hash against the hash recorded at that day's start, and
reports the error. A mismatch is an integrity failure and the run does not continue.

### 17J.5 Companies and capital markets

The feasibility and architecture proposal is
`docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md` (D-123). Companies own buildings and
keep balance sheets; production, markets and settlement are unchanged. The player is
the state and has no private fortune. Implementation is P9–P13, after the real
economy (P1–P8).

### 17J.6 Performance

Each stage reports Node per-day p50/p95/p99 and a per-phase breakdown at full scale.
Node results are diagnostics; on-device performance is measured by the designer and
is not claimed by implementation reports. Baseline on 2026-11-02 (current 1900 world,
359 blocks, 548 buildings, Node 22 on Windows desktop): p50 657 ms, p95 1,026 ms per
simulated day.

---

## 18. Code-agent execution contract



### 18.1 Scope control

1. Implement only the milestone explicitly assigned in the current task.
2. Read the existing repository and tests before changing files. Preserve working functionality unless a change is required for the assigned milestone.
3. Do not replace the architecture, add a framework, or introduce dependencies without explaining the need and compatibility.
4. Do not silently change the design. Record substantive decisions or deviations in `DECISIONS.md`.

### 18.2 Before implementation

5. Identify the deliverable, dependencies, relevant files, and acceptance criteria.
6. Write or update tests before implementation.
7. Identify contradictions or undefined rules. Raise material design issues with a proposed resolution; do not invent major game mechanics without documenting the assumption.
8. For minor reversible details, select the simplest compatible behavior and record the assumption.

### 18.3 Implementation quality

9. Build the smallest complete vertical slice satisfying the current milestone.
10. Keep authoritative simulation state separate from caches, snapshots, and UI state.
11. Every numerical constant must live in a documented configuration/constants location or validated data file, with units and its status as calibrated or provisional.
12. Every formula must document inputs, units, update cadence, bounds, and intended effect.
13. Avoid hidden global state, external entropy, non-deterministic iteration dependence, and uncontrolled state growth.
14. Optimize after profiling. Allocation-free hot loops are a possible optimization, not a reason to make the model harder to understand before a bottleneck is demonstrated.
15. Do not weaken, delete, or skip an acceptance test just to obtain a passing build.

### 18.4 Verification and completion report

16. Run all relevant tests, type checks, and required benchmarks. State clearly when a check could not be executed.
17. Add regression tests for bugs found during the milestone.
18. When authoritative state or tick logic changes, re-run determinism, serialization, and applicable conservation tests.
19. The completion report must list files changed, implementation decisions, exact commands executed, test results, benchmark environment/results, deviations, assumptions, and known limitations.
20. Never claim a test, benchmark, device build, or historical calibration passed unless it was actually executed and its result is available.
21. Do not begin the next milestone until the current acceptance criteria pass or the designer explicitly accepts an exception.

---

## 19. Explicit non-goals for v1

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

**Economic Management Overhaul status.** v2.6 specifies the E0–E6 Economic Management
Overhaul in §17A as a design program; v2.7 records E1 as implemented; v2.9 records E2
(Fiscal Management) as implemented; v2.10 records E3 (Public Investment and
Construction) as implemented; v2.11 records E4 (Industrial and Business Policy) as
implemented for its scoped subset. E0 is documentation/design. E1 is
presentation/selectors plus bounded confirmed action history and adds no new economic
mechanic. E2 adds the implemented fiscal instruments, budget decomposition, reserve
policy, business-profit tax, and validated financing actions recorded in §17A.18 and
D-073. E3 adds the implemented public-construction queue, idle-labor capitalization,
completion into state-owned productive buildings, and construction reporting/UI
recorded in §17A.19 and D-074. E4 adds validated sector classification, construction
material procurement, sectoral production subsidies, and public-enterprise capital
support recorded in §17A.20 and D-075; private co-financing, loans, guarantees,
investment tax credits, general procurement, expansion/discontinuation, and price
controls remain E5–E7 dependencies. E5–E6 remain planned and not implemented. They do
not become part of the current v1 delivery, the M0–M7 slice, or any implementation
milestone unless a later task explicitly assigns the stage. Their absence from the
current build is not a defect
in the accepted M0–M7 baseline.

---

## 20. Decision register and handoff procedure

### 20.1 Design decisions already fixed for v1

The following choices are resolved in this version:

1. **Population grouping:** aggregate region × principal occupation blocks, including dependents, with authoritative single-year male/female age state (`Uint32Array(81)`; index 80 = 80+) and derived 17 five-year reporting bands. **Superseded direction (v2.19, D-117/D-118, P2):** sparse province × profession blocks with the same age state; the region layer is removed.
2. **Employment:** explicit quantitative assignments; no single `employedAt` per pop block.
3. **Market stock:** physical inventory requires storage capacity; the Warehouse is included in v1.
4. **Accounting unit:** RUSD is the fixed unit of measurement/accounting denomination, not a national currency. M4a-1 balances are nominal RUSD. M4a-2 adds currency identity and scenario-provided or unavailable RUSD-relative valuation; it does not implement dynamic FX, inflation, monetary policy, native-currency balances, or currency conversion in settlement. Future regime/FX effects remain aggregate and simplified. **Amended (v2.19, D-122):** RUSD is defined as 1990 reference dollars; local-currency display is P3.
5. **Accounting integrity:** financial flows use balanced double-entry postings. M4a-1 adds category-aware accounts, normal-side balances, recognition legs, and opening balances. M4b adds the monthly period close, immutable monthly finance summaries, the semantic posting matrix, and the internal `period-close` kind (§5.4.2, D-047). M4c adds country treasury and fiscal accounts, the cash-neutral `income-tax` and `welfare-transfer` kinds, and fiscal close into country equity (§5.4.3, D-048). Annual close and controlled correction/reversal entries are planned in M7a; long-term history compaction remains future.
6. **Randomness:** keyed/counter-based deterministic random draws, not one shared mutable PRNG stream.
7. **Daily ordering:** the pipeline in §4.2 is binding unless changed with tests and a decision record. In particular, M3d market clearing includes bounded price adjustment before M3e settlement; settlement uses established transaction prices (D-043). Moving price adjustment after settlement requires a new decision and regression tests.
8. **Dependency markets:** dependencies initially share the overlord’s market unless data, event, or policy specifies another customs zone; transfers remain separate recorded flows.
9. **Wealth level:** a cached/smoothed index per pop block, not money and not an independently spendable resource. Monthly update uses the provisional income convention in §6.5; M4c includes welfare in the income basis and income tax in mandatory payments; an exact trailing-month average is not implemented.
10. **Buildings:** physical instances are located in regions and owned by private or state accounts. Current M3 baseline instances are private only.
11. **Historical calibration:** target values are provisional until metric definition, date convention, and source provenance are complete. Post-1950 WPP validation is source-backed; 1900–1949 population composition and schedules remain provisional; the 1900 campaign is not a historical-validation success.
12. **Performance:** Node benchmarking is diagnostic; mobile performance is unverified and must be confirmed on a named reference device in a release build. No mobile target has passed. The mobile p95 target is **NOT EVALUATED**. M6 executes a full 36,524-tick Node campaign in opt-in mode and reports p50/p95/p99, but it remains a Node diagnostic. M7's worker host measured complete tick plus snapshot at Node p95 80.46 ms and produced web/iOS/Android JS bundles, but no native release build or real-device measurement exists.
13. **M2-only finance fixture:** on the M2-only path, needs are funded from annual disposable income only, with no savings drawdown and no account mutation. M3f economic worlds instead use opening household cash and actual settlement; the full intended model remains household financial assets plus settled income less mandatory payments.
14. **Economic-day atomicity:** for worlds with buildings or markets, the complete day is staged on a structural clone and published only after all phases and final validation succeed. The M4c fiscal batch is itself atomic. The M2-only path is separate. **Superseded direction (v2.19, D-116, P1):** per-phase precondition validation and checkpoint rollback with deterministic replay; no partial day is ever accepted.
15. **Catalog scope:** the current M3 data subset is eight goods and eight building types; the fifteen-good/thirteen-building v1 target remains design intent, not current completeness.
16. **Country and currency identity:** M4a-2 uses `World.countries`, `World.currencies`, and `World.currencyValuations`; `Country.monetary` is the sole domestic monetary arrangement, `Currency.issuer` is issuer identity, and `Country.regionIds` is the sole country-to-region ownership mapping. There is no `Region.countryId`, `Country.currencyId`, or `fxToUSD`. D-044/D-045 record the approved RUSD/currency decisions. The one-issued-currency limit is a current scope restriction, not a permanent design commitment; the foreign-adoption requirement is a current M4a-2 validation rule recorded in D-045.
17. **Government fiscal policy:** M4c makes `Country.fiscal` and `Country.treasuryAccountId` authoritative; E2 extends `Country.fiscal` with the income-tax exemption, welfare eligibility ceiling, business-profit tax rate, and treasury reserve target. The personal rate is a provisional hard-bounded tax on the taxable part of actual wages, not law-bounded; collection efficiency is fixed at 1.0; welfare is a single budgeted transfer with a wealth-eligibility ceiling and proportional funding reduction. The business-profit tax is assessed at month-end on each building's positive recognized period result and limited by its operating cash. D-048 records the M4c scope, timing, and limitations; D-073 records the E2 extension. M5a adds scenario-initialised `World.profitDistribution` and balanced private distributions/state-enterprise remittances (D-056); it does not make state receipts income-tax revenue. M5b adds scenario-initialised `Country.debt`, versioned contracts, deficit financing, interest, maturity/refinancing, arrears, and explicit default (D-057); borrowing is not revenue and principal repayment is not expenditure. M6 adds the shared `set-fiscal-policy` player/AI action and `World.countryAI`/`Country.ai` state (D-058). E2 extends that action to the complete fiscal policy and adds validated `issue-debt`, `repay-debt`, and `set-debt-policy` actions; none creates money or a posting without a balanced counterpart. The budget memo and period/annual budget totals separate requested/paid/shortfall and revenue/borrowing/principal/interest. Consumption/excise, property/land, customs, and education/health/administration/procurement spending remain unimplemented dependencies (E5/E6a/E4 and prerequisite systems). Inflation/FX/monetary-policy foundations remain planned in M8a/E6b (§17.3/§17A.10).
18. **Monetary precision and result phases:** authoritative RUSD uses continuous binary64 arithmetic in a fixed order with no cent quantization; `MONEY_TOLERANCE_RUSD = 1e-6` is an invariant tolerance, not a rounding operation. Transient settlement, needs, and fiscal cash fields are phase-qualified; the authoritative ledger is final cash. D-049 records the policy and its known-answer/residual rules.
19. **Multi-region/multi-market ownership and access:** `Country.regionIds` owns regions; `Market.regionIds` owns market membership and `Region.marketId` is validated to it; one market per country and one market per region in M5. Each market is cleared once with market-scoped production/storage/prices/inventory; shared-market regions pool once. **E6a adds real inter-market trade (D-079):** authored directional routes, capacity derived from the two markets' M8 infrastructure, producer-consignment shipments with transit, exact-once delivery, and a market-level customs boundary with an explicit administration. Intra-market pooled allocation remains shared-market clearing and is not dutiable. A non-simulated rest-of-world sector and foreign-exchange settlement are not implemented. `Country.immigrationOpen` is provisional scenario state controlling cross-country migration and cross-country employment; internal migration/labor is unrestricted and emigration is unrestricted in M5. D-051/D-052/D-079 record the rules and non-goals. **Superseded direction (v2.19, D-118/D-119, P2):** provinces own population and buildings; customs territories are the markets, national by default.
20. **Historical data pipeline:** the M5 sample is eight authored 1900 polities in source-annotated tables with a deterministic validator/loader. Population totals are rounded source-referenced estimates; occupation composition and other structure are provisional. No century-scale historical population/occupation-trend calibration is claimed, no FX rates are invented, and no simulation code reads calibration totals to force outcomes. D-053 records the contracts and limitations.
21. **Country AI:** M6 makes `World.countryAI.enabled` a scenario-provided policy and `Country.ai` the fixed-size persisted schedule/goal state. The AI decision function receives only `CountryAIObservation`; it has one action, `set-fiscal-policy`, shared with a player through `validateCountryAction`/`applyCountryAction`. The AI is deterministic, uses no random draw, and never borrows, issues money, or mutates debt. Construction, infrastructure priority, laws, diplomacy, and military actions remain unimplemented. D-058 records the rules and non-goals; D-059 records the hot-path summary-validation optimization.
22. **Playable shell and worker bus:** M7 implements `packages/sim-worker` protocol version 2 at M7 completion (version 3 after E1's additive snapshot fields, version 4 after M7a's annual reports), the `SimulationHost`, bounded immutable snapshots, and Web Worker/WebView/Node transports. The Expo app has the six specified screens and sends only protocol commands; it never imports the simulation implementation or the live world. The map is a 16-region authored-sample grid without pan/zoom or 500-region geometry. Saves are gzip-compressed only at AsyncStorage storage boundary. Native iOS/Android release builds and real-device performance are **NOT VERIFIED**; M7 carries that documented acceptance exception. D-060/D-061 record the architecture and limitations.
23. **Economic Management Overhaul:** v2.6 adopts the E0–E6 program and the combined order `M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4 → M8 → M9 → E5 → E6 → M10`; the authoritative sequence, stage scope, exclusions, and dependency gates are §17.5 and §17A, with the material ordering decision in D-070. E0 is documentation/design; **E1 is implemented (§17A.17, D-071)** and adds no new economic mechanic; **M7a annual accounting is implemented (§17B, D-072)**; **E2 fiscal management is implemented (§17A.18, D-073)**; **E3 public investment and construction is implemented (§17A.19, D-074)**; **E4 industrial and business policy is implemented (§17A.20, D-075)**; **M8 laws and institutions is implemented (§17C, D-076)**; **M9 technology and education is implemented (§17D, D-077)**; **E5 labor and social institutions is implemented (§17E, D-078)**; **E6a transport, access, inter-market trade, and customs is implemented (§17F, D-079)**. E6b monetary, foreign-exchange, and price-measurement systems is implemented (§17G, D-080); commercial banking, credit, a policy rate, external debt, and M10 remain unimplemented. The program's principles include one player-controlled country, real mechanics, trade-offs, time lags, fiscal constraints, explainability, institutional appropriateness, determinism, UI/simulation separation, calibration honesty, and no decorative controls. M0–M7 records, the M7 native/device exception, M8a/E6b, and M10 remain in force.
24. **M9 technology and education:** v2.13 implements the §10 scope: validated acyclic technology data across six eras; per-country research projects whose work comes only from funded academic labour; technology effects on sector output, mortality, education quality, buildings, and laws; an education institution with real staffing and cash-limited payroll; and authoritative age-specific literacy updated by schooling and shifted by ageing and migration. Education law uses the M8 pathway. The material choices are D-077. M9 does not implement E5, E6/M8a, or M10.
24. **M8 political institutions:** the implemented model is regime/law/election/interest-group/unrest/institution state, not a political-power pool. Only taxation, suffrage, labor, and trade law slots expose options; education, health, military service, colonial policy, and currency remain later-stage dependencies. Enactment uses derived influence-weighted support, regime eligibility, prerequisites, and a persisted effective day; statutory tax bounds clamp forward. Elections require an elected regime, positive franchise, population, and minimum quality. Regional unrest and crisis pressure are derived from measured conditions; revolution changes regime/government/laws and disrupts institutions without monetary or demographic postings. Administration is clerk-staffed and paid through a cash-neutral payroll; quality/overload affect tax collection, construction, enactment, and unrest. Scripted events apply once with provenance. AI law/funding actions and player crisis-response actions are not implemented. D-076 is the material decision record.

### 20.2 Remaining designer decisions

These are intentionally left open because they depend on desired gameplay depth rather than technical correctness. Use the stated default until the designer chooses otherwise:

1. **Campaign victory/end state:** default is a sandbox with a historical end-of-century report, not a mandatory victory condition.
2. **Player country selection:** default is any fully authored sovereign polity in the selected scenario; incomplete stubs are not playable until validated.
3. **Ironman/reload restrictions:** default is unrestricted save/load, with no Ironman mode in v1.
4. **Historical deviations:** default is a baseline event set that allows outcomes to diverge; no forced “railroad” restoration after an alternate outcome unless an event explicitly requires it.
5. **Monetary depth beyond v1:** default is the fixed-RUSD measurement model with M4a-2 currency identity and RUSD-relative valuation; dynamic FX, inflation, monetary policy, central banking, detailed local denominations, and banking instruments remain deferred and are not current M4a-2 behavior. M8a is the planned stage for inflation measurement, exchange-rate dynamics, and monetary-policy foundations, but it is not implemented and any missing prerequisite must be recorded.
6. **Monthly-wealth income window:** the current convention uses current-day actual settled wages annualized by the civil year because the GDD does not define a monthly window and no accumulator exists. An exact trailing-month average requires an authoritative per-block income accumulator and a schema/save-format change. The default remains the documented provisional convention until the designer chooses a measurement window and migration policy.
7. **Economic Management open choices:** the questions in §17A.16 (construction capitalization/materials, land/property, trade counterparty, banking/credit, inflation measure, health/pensions/bargaining, sector classification, player/AI action expansion, GDP/headline measures, report retention, and save/schema migration) are otherwise unresolved. Each later E stage must resolve the questions it needs with a decision record and tests; none may be treated as accepted by E0 alone. E1 resolves report retention for its own scope as 12 monthly summaries plus 48 session actions (D-071); it does not resolve the other choices. The default is to leave the lever unimplemented until its mechanism exists.

The agent must not expand these topics autonomously during early milestones. It may add proposals to `DECISIONS.md` for designer review.

### 20.3 Handoff procedure

For every agent session:

1. Provide this GDD plus only the sections relevant to the assigned milestone.
2. State the current milestone and its required deliverables.
3. Ask the agent to inspect the repository and produce/update the tests first.
4. Require an implementation plan that identifies files, interfaces, tests, and assumptions before large code changes.
5. Require the completion report defined in §18.4.
6. Review any `DECISIONS.md` items and test failures before assigning the next milestone.

**Initial task:** for a new project, start with M0 and M1 only, using §§3–5, §§14, 16–18 as binding references. The first deliverable is a tested simulation foundation, not the economy or UI. For the current repository, **M0/M1/M2/M2.1/M3a–M3f/M4a-1/M4a-2/M4b/M4c/M5/M5a/M5b/M6/M7a/M8/M9/M10** are the accepted/implemented baseline, with M7 carrying its native-release exception. **E0 is complete as the design specification in §17A; E1, E2, E3, E4, E5, E6a, and E6b are implemented economic stages; M8, M9, and M10 are implemented.** No further stage is assigned. The next implementation stage must be assigned explicitly from §17.5/§17A/§9 and must not be inferred from this document alone.

---

## 21. Glossary

- **Authoritative state:** runtime data that determines the simulation result and cannot be reconstructed from other stored data without loss.
- **Cache:** derived data retained for speed or presentation; it can be rebuilt from authoritative state.
- **Civil day:** a calendar day determined by the Gregorian calendar, independent of device time zone.
- **Day index:** integer index for the next civil day to process.
- **Funded demand:** demand that a buyer can actually pay for under current rules.
- **Historical shock/event:** a dated or trigger-based event that changes underlying conditions, not a forced final outcome.
- **Market:** the defined pool of tradable goods and prices shared by a set of regions.
- **Pop block:** aggregate population associated with a region and principal socioeconomic occupation/household type.
- **Single-year age state:** the authoritative per-sex array of 81 counts; indices 0–79 are exact ages and index 80 is the open-ended 80+ group.
- **Five-year band:** a reporting/validation aggregate derived from single-year age state; never separate authoritative population.
- **Historical-validation scenario:** a run initialized from a source-backed historical date and age/sex distribution, used to test whether source-backed schedules reproduce history.
- **Gameplay baseline:** a scenario with explicitly provisional or designed assumptions, used for play; it is not automatically a historical validation.
- **RUSD:** the simulation's fixed unit of measurement and accounting denomination. It is not a national currency, necessarily an actual U.S. dollar, or a promise of constant purchasing power. Its definition is fixed; nominal RUSD values are distinct from future real/inflation-adjusted values.
- **Currency issuer:** the entity that issued a currency: a simulated country, an explicitly represented foreign issuer, or a future union. Adoption does not change issuer identity.
- **Domestic monetary arrangement:** a country's sole `own` or `adopted` selection of a currency for domestic use; it is not the same as issuer identity.
- **Currency valuation:** the single `CurrencyValuation` record for a currency, either specified (`rusdPerUnit`, `setOnDay`, scenario source) or explicitly unavailable. It never defaults to parity.
- **RusdPerCurrencyUnit:** the RUSD value of one unit of a currency. It is a valuation input, not by itself a peg; it is serialized as a plain JSON number and branded in code.
- **Nominal RUSD:** an amount measured in the fixed RUSD unit without inflation adjustment.
- **Real purchasing power:** a future derived measure of what nominal RUSD can buy, using a documented price index or reference period; it is not the same as nominal RUSD.
- **Country-region ownership:** the authoritative mapping in `Country.regionIds`; a region may be unassigned, and there is no `Region.countryId`.
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
- **Current implementation:** the behavior actually delivered and tested by the accepted M0–M4c baseline, as distinct from provisional rules and future requirements.
- **Planned intermediate stage:** M8a in §17.3. It extends the roadmap and is not
  implemented; it does not change the accepted M0–M5b baseline or the M0–M7 vertical
  slice boundary. M5a, M5b, and M7a are implemented and accepted (§17.2b/§17.2c,
  §17B).
- **Economic Management Overhaul:** the E0–E6 design program in §17A for player economic diagnosis, policy, public investment, industrial strategy, labor/social policy, trade, monetary foundations, and regulation. E0 is documented; E1, E2, E3, E4, E5, E6a, and E6b are implemented.
- **Annual finance summary:** the compact, immutable record appended after the 31 December monthly close. It holds annual tax/welfare/interest/net flows, the four world gross flows, year-end treasury/debt/interest balances, and the world-wide correction count; it holds no account trial balance.
- **Controlled correction:** a new audited finance posting that names an original posting and a reason. It is applied atomically, never edits a closed summary, and lands in the current open period if it concerns the past.
- **E stage:** one Economic Management implementation stage (E1–E6, with E5a/E5b and E6a/E6b substeps). E0 is the design specification. E1, E2, E3, E4, E5, E6a, and E6b are implemented. E stages are not renaming or replacing M milestones.
- **Taxable base:** the actual measured quantity a tax applies to (wages received, taxable profit, eligible transaction value, assessed property/land value, or dutiable trade value). A rate without a defined base is not an implementable tax.
- **Public investment project/construction queue:** a planned asset with explicit money/labor/material/time requirements and progress; completion creates an actual building/infrastructure asset, not an instant bonus.
- **Policy action:** a validated, deterministic command that changes a defined authoritative policy field/rule through the shared player/AI action path. It does not mutate the live world directly from the UI.
- **Monthly economic report:** a bounded, derived presentation summary of the month's economic changes, actual revenues/expenses, player actions/projects, completions, and supported explanations. It is not a second authoritative economy or per-day history.
- **Public enterprise:** a state-owned productive asset/enterprise with explicit capital, operating cash, profit/loss, and remittance rules. Creation/expansion is not implemented; remittance mechanics exist where state ownership is present.
- **Tariff/customs duty:** a tax on an actual import crossing a defined customs boundary. **Implemented in E6a (D-079):** an ad-valorem charge on the origin-market cargo value of each shipment entering a market whose customs administration differs from the origin market's; it is never attached to shared-market clearing.
- **Customs administration:** the country recorded in `Market.customsCountryId` that administers a market's customs boundary. The M5 sample's multi-polity markets share one administration (a customs-union reading); a member polity's own tariff schedule applies only where it administers a frontier.
- **Trade route:** authored, validated geography connecting two markets, with a provisional distance and a base daily cargo-value capacity that is scaled by both markets' infrastructure. It is a constraint, not a resource, and there is no multi-hop routing.
- **Monetary authority:** an institution/law-backed actor with explicit instruments and channels; not an arbitrary slider. **Implemented in E6b (D-080)** as a reserve-backed currency board for own-currency countries, with a law-gated managed regime, bounded parity policy, and balanced accounting; commercial banking and credit remain missing prerequisites.
- **Sovereignty:** the country that legally owns a region under the simulation's territorial model. It is `Country.regionIds` and changes only through a validated peace-treaty cession (M10/D-081).
- **Military control / occupation:** the country exercising temporary effective military control over a region, recorded separately as `Region.controllerCountryId` and `Region.occupiedSinceDay`. It never changes sovereignty, markets, buildings, people, accounts, treasuries, or monetary authority.
- **Occupation:** temporary military control of a region by an at-war country; it applies unrest and a garrison cost to the controller but transfers no ownership or economic state.
- **Real vs nominal:** nominal values are measured in fixed RUSD; real values require a documented price index/base. **E6b (D-080)** implements a Laspeyres price index with a fixed needs-derived basket, base 100 at the scenario start, bounded month-end observations, and coverage; it is a measured nominal price-level comparison, not a full deflator, and it does not index any contract or account.
- **Whole-day staging:** running all phases of an economic day on a structural clone and publishing it only after every phase and final validation succeeds.
- **Vertical slice:** the smallest playable end-to-end version that proves the complete product path rather than only isolated systems.

---

**End of document.**
