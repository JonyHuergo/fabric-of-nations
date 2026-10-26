# CENTURY — GRAND STRATEGY 1900–2000

**Working title:** *Century*\
**Document type:** Game Design Document and Agent Implementation Specification\
**Version:** 2.5\
**Revision date:** 2026-10-25\
**Target platform:** iOS and Android\
**Application stack:** React Native / Expo, subject to a worker-runtime proof of concept\
**Simulation period:** 1900-01-01 through the boundary at 2000-01-01\
**Simulation resolution:** One simulated civil day per tick

> **v2.5 alignment note.** This revision supersedes v2.4 as the authoritative
> specification. It records the accepted **M0–M4c** implementation baseline:
> the M1 foundation, the M2/M2.1 population and demographic model, the M3a–M3f
> economy stages, M4a-1 category-aware double-entry accounts and opening
> balances, M4a-2 country/currency identity, monetary arrangements, and
> SUSD-relative valuation, M4b monthly period close and finance summaries, and
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
> fixtures disabled; M7–M10 remain planned and unimplemented. The GDD 4 MiB save
> target is reported against the measured full-campaign save size and is not
> claimed as met.

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
18. Code-agent execution contract
19. Explicit non-goals for v1
20. Decision register and handoff procedure
21. Glossary

---

## 1. Vision and design pillars

### 1.1 Vision

*Century* is a historical grand-strategy simulation in which the player governs a state through the economic, demographic, political, and geopolitical transformations of the twentieth century. The simulation spans industrialization, urbanization, mass education, total war, ideological conflict, decolonization, fiscal expansion, and the rise of the service economy.

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

---

## 2. Core doctrine: no arbitrary gameplay pools

### 2.1 Binding rule

The simulation must not introduce an arbitrary, spendable point pool merely to gate actions or create gameplay friction. A quantity traditionally represented by “mana” must instead be derived from people, institutions, resources, goods, money, time, laws, or other explicit state.

This does **not** prohibit every scalar, counter, index, or stored value. Money balances, inventory, debt principal, employment, technology project progress, building capacity, institutional quality, and other quantities are valid when their sources, uses, and update rules are defined.

### 2.2 Required replacements

| Traditional abstraction | Required model in *Century* |
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
   most once unless explicitly defined as recurring. *(Current M6: country AI
   evaluates on its staggered seven-day schedule and applies only validated
   fiscal-policy changes through the same action validator a player uses.
   Scheduled events and general law/policy systems remain future; there is no
   event queue.)*
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
   repair immediately. *(Current M3b/M3f implementation.)*
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
   *(Current M3c/M3d/M3e/M3f implementation; market-scoped by M5.)*
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
    with the M4c income-tax/welfare input refinement. Other daily/weekly/monthly
    macroeconomic indicators are future systems.)*
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
    fiscal flows, and M5a profit allocation exist; annual finance summaries and
    annual close are planned in M7a; broader annual history and historical-event
    recording are future systems.)*
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
type MoneySUSD = number;      // nominal SUSD unit of measurement (not a national currency)
type Rate = number;          // normalized ratio, normally 0..1
type Count = number;          // non-negative integer persons, jobs, or items
type IndexValue = number;     // documented derived index; range specified per field
```

`SUSD` is the simulation's fixed **unit of measurement and accounting
denomination**, not a national currency or necessarily an actual U.S. dollar.
Its definition is fixed, but its purchasing power is not fixed: nominal SUSD
values are distinct from any future real/inflation-adjusted values derived from
a documented price index or reference period. M4a-1 accounting balances are
nominal SUSD. SUSD is not registered, issued, or adopted as a currency in M4a-2,
and a fixed SUSD measurement unit does not imply that other currencies are
pegged to SUSD. Future currency regimes and FX indicators may influence
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
  basePrice1900SUSD: MoneySUSD;
  transportCostPerUnit: MoneySUSD;
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
  baseWage1900SUSDPerYear: MoneySUSD;
  trainingCostSUSD: MoneySUSD;
  laborProductivityModifier: number;
}

interface BuildingDef {
  id: Id;
  key: string;
  name: string;
  inputs: { goodId: Id; quantityPerFullOutputDay: number }[];
  outputs: { goodId: Id; quantityPerFullOutputDay: number }[];
  jobs: { professionId: Id; workersAtLevelOne: number }[];
  constructionCostSUSD: MoneySUSD;
  dailyUpkeepSUSDAtLevelOne: MoneySUSD;
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
  priceSUSD: number[];
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
  fiscal: FiscalPolicy;                // current M4c: provisional tax/welfare policy
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
  incomeTaxRate: Rate;                 // dimensionless flat rate, 0..1
  welfareBudgetSUSDPerYear: MoneySUSD; // requested annual nominal target, >= 0
}

interface Currency {
  id: Id;
  key: string;                         // stable lower-case; `susd` reserved
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

type SusdPerCurrencyUnit = number;     // SUSD per one currency unit; branded in code

type CurrencyValuation =
  | {
      currencyId: Id;
      status: 'specified';
      susdPerUnit: SusdPerCurrencyUnit;
      setOnDay: DayIndex;              // equals the world start day in M4a-2
      source: 'scenario';
    }
  | { currencyId: Id; status: 'unavailable' };

// Historical: the v2.2 `CurrencyState` target (`regime`, `fxToUSD`,
// `inflationIndex`, `goldReservesOunces`, `centralBankAccountId`,
// `moneySupplySUSD`) is superseded by the M4a-2 model above. Those fields are
// not current authoritative state; they are retained only in the historical
// v2.2 document. Regimes, inflation, gold convertibility, central banking, and
// monetary aggregates remain future systems described in §8.6.

interface CountryStats {
  population: number;
  workingAgePopulation: number;
  employment: number;
  unemployment: number;
  nominalGDP12M: MoneySUSD;
  exports12M: MoneySUSD;
  imports12M: MoneySUSD;
  governmentRevenue12M: MoneySUSD;
  governmentSpending12M: MoneySUSD;
  debt: MoneySUSD;
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
`regionIds` and `priceSUSD`, not the target aggregate flow arrays. M4a-1
`FinancialAccount` uses `category`/`subtype` with normal-side `balanceSUSD`, and
M4c adds the `country` owner kind and the fiscal subtypes (§5.4.3);
`FinanceState` contains `accounts`, `postings`, `nextPostingId`, `nextAccountId`,
`opening`, `periodSummaries`, and `closedThroughDay`. The M4b monthly summaries
and close boundary are current authoritative state (§5.4.2); debt contracts, the
target audit-buffer name, monetary aggregates, and a `World.history` collection
are future. M4a-2 adds no native-currency balances. M5 makes multi-region worlds,
multiple markets, and migration current behavior (§5.4.4); it adds no migration
flow history, external-trade account, or new monetary state. These are
implementation boundaries, not permission to omit conservation or serialization.

### 5.4.1 M4a-2 country, currency, and valuation model (current)

M4a-2 makes `World.countries`, `World.currencies`, and
`World.currencyValuations` authoritative. `Country.monetary` is the sole domestic
monetary arrangement; there is no top-level `Country.currencyId`.
M4c extends the scenario country input to `CountryInitialDef`, which adds
`treasuryAccountId`, `initialTreasuryCashSUSD`, and `fiscal`; construction builds
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
A specified record carries `susdPerUnit` (the SUSD value of **one** unit of the
currency), `setOnDay` (equal to the world start day in M4a-2), and
`source: 'scenario'`. Missing or unavailable valuations never default to parity or
another currency's value. SUSD is not a currency-registry entry or a valid
arrangement target, and currency keys cannot represent SUSD through casing
variations.

Cross rates are derived, never stored:

`crossRate(from, to) = from.susdPerUnit / to.susdPerUnit`

The result is units of `to` per one unit of `from`. `susdPerUnit` is a valuation
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

### 5.4.3 M4c government fiscal model (current)

M4c makes a per-country treasury and a provisional fiscal policy authoritative.
It is the approved design recorded in D-048.

**Country and household accounts.** Every country owns exactly one
`treasury-cash` (asset, designated cash), `income-tax-revenue` (revenue),
`welfare-expense` (expense), and `owner-equity` (equity) account. The treasury id
is scenario-declared (`CountryInitialDef.treasuryAccountId`); the remaining
country accounts are deterministically allocated above the declared-id floor.
Opening treasury cash (`CountryInitialDef.initialTreasuryCashSUSD`) is applied
once through `applyOpeningBalances` with the country equity account as its
counterpart; opening revenue/expense balances remain rejected. Every pop block
in a world that declares at least one country owns `income-tax-expense` (expense)
and `welfare-income` (revenue) in addition to its existing cash, equity,
wage-income, and consumption-expense accounts. Countryless M2/M3 fixtures retain
their original owner account set and have no fiscal system, preserving their
behavior and benchmark baseline; validation requires the fiscal account set
whenever the world contains a country.

**Fiscal policy.** `Country.fiscal` carries `incomeTaxRate` (dimensionless,
0..1) and `welfareBudgetSUSDPerYear` (nominal SUSD/year, finite, nonnegative,
bounded by a documented numeric-safety limit). It is scenario-initialised
provisional state, not law-bounded and not mutable by an action in M4c; M8 may
replace the rates with enacted taxation laws. Collection efficiency is fixed at
1.0 because no bureaucrat, institution, or administrative-service model exists
yet.

**Income tax.** Once per processed day, in the fiscal phase after settlement, a
residence-based flat tax `incomeTaxRate × wages actually received that day` is
withheld from each pop block. The residence country is the country that owns the
block's region. There are no exemptions, strata, wealth taxes, or tax on
welfare. Partial wage payments produce proportionally partial tax, and multiple
employers are already combined by settlement into one daily receipt. The posting
debits `income-tax-expense`, credits `household-cash`, debits the country
`treasury-cash`, and credits `income-tax-revenue`. Gross `wage-income` and the
employer's `wage-expense` are unchanged. Tax cannot exceed received wages or the
block's cash; a violation is reported as an implementation error without
mutation.

**Welfare transfer.** Once per processed day, `requested =
welfareBudgetSUSDPerYear / daysInYear(current civil year)`. The payable amount
is the lesser of `requested` and treasury cash available after that day's
income-tax receipts. Payable is allocated across the country's pop blocks in
proportion to population in ascending block-id order; the final recipient
receives the exact remainder, so allocations sum exactly to payable without a
random draw. The posting debits `welfare-expense`, credits each block's
`welfare-income`, debits each block's `household-cash`, and credits
`treasury-cash`. If the treasury cannot fund the request, only the payable amount
is transferred, the shortfall is recorded, and no debt, arrears, or negative
cash is created. A zero budget creates no posting; with zero population the
requested amount is reported as shortfall because there is no recipient.

**Atomicity, guards, and result.** The fiscal phase is an internal stage invoked
by `runEconomicDay` and is deliberately not re-exported from the package root. It
validates the world, the processed day (including terminal-boundary rejection),
the settlement's world/day/seed/scenario/start-day/market context, a stale
posting boundary, and a single-use marker before staging anything. The day's
entries are applied to an isolated finance clone; the complete staged world is
validated and treasury reconciliation is checked before the clone replaces
`world.finance`. Any failure leaves the original accounts, postings, posting ids,
summaries, close boundary, and settlement consumption state unchanged. The
transient phase result reports per-country income tax, requested/paid welfare,
shortfall, start/end treasury cash, and per-block tax/welfare amounts plus
`endingCashAfterFiscalSUSD` read from the staged authoritative account. The
supported simulation entry point remains `tick`/`runEconomicDay`; tests import the
phase module directly only to exercise staging and guards.

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

**Monetary precision.** Authoritative SUSD amounts remain continuous binary64
`number` values in a fixed deterministic order; there is no cent quantization,
decimal money type, or fixed-point migration. `MONEY_TOLERANCE_SUSD = 1e-6` is
used for invariant/reconciliation comparisons only, never as a rounding operation
on balances. The welfare residual rule is proportional by population in ascending
block-id order with the exact remainder and no random draw. D-049 records the
full policy; display formatting belongs to a future UI layer.

**Transient cash fields.** Settlement results report
`endingCashAfterSettlementSUSD` (after market/wages/upkeep, before fiscal). Needs
results report `budgetStartBeforeNeedsSUSD` and `budgetEndAfterNeedsSUSD` (before
and after needs spending, before fiscal). Fiscal block results report
`endingCashAfterFiscalSUSD`. Only the authoritative ledger balance is final
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

**Issuers and holders.** A country treasury issues SUSD debt. The holder must be an
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
and arrears start day. `nextContractId` is deterministic. Maturity is capped at the
campaign terminal boundary. Rates, terms, ceilings, and grace periods are provisional
structural inputs, not calibrated or mutable controls.

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
before the M4b close, a debt-enabled country computes its accrued fiscal deficit as
`welfare-expense + interest-expense - income-tax-revenue`. It may issue debt up to
the smaller of that deficit, the designated creditor's actual cash, and outstanding
headroom. Borrowing proceeds are financing, not revenue. Any unfinanced deficit is
reported as `unfinancedDeficitSUSD`; no invisible liability is created. M4c's
welfare shortfall rule is unchanged, so an intra-month liquidity shortage can still
underpay welfare. Principal repayment is not expenditure. `governmentPeriodTotals`
reports interest expense and a net fiscal result including it; the M4b four flow
kinds remain unchanged.

**Atomicity.** The phase clones finance and applies accrual, financing, coupons,
maturities, refinancing, and default, then validates accounts, contracts, postings,
summaries, accounting identity, and aggregate designated-cash conservation before
publishing. Failures leave the authoritative world unchanged.

**Schema and compatibility.** World schema **12**, simulation **0.12.0**, save format
**1**, `dataVersion` **`m3-economy-v1`**. Schema-11/simulation-0.11.0 saves are
rejected; no migration. M5b does not add banking, deposit money, a central bank,
monetary issuance, bond-market pricing/auctions, derivatives, external investors,
debt-to-GDP targeting, interest taxation, or player/AI debt actions.
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
  fundedAnnualSUSD: MoneySUSD;
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
  balanceSUSD: MoneySUSD;              // normal-side units; signed only for equity
}

interface JournalLine {
  accountId: Id;
  side: 'debit' | 'credit';
  amountSUSD: MoneySUSD;               // strictly positive
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
  principalSUSD: MoneySUSD;
  outstandingPrincipalSUSD: MoneySUSD;
  annualCouponRate: Rate;
  issueDay: DayIndex;
  maturityDay: DayIndex;
  accruedInterestSUSD: MoneySUSD;
  status: 'active' | 'arrears' | 'repaid' | 'defaulted';
  arrearsSinceDay: DayIndex | null;
}

interface FinanceState {
  accounts: FinancialAccount[];
  debtContracts: DebtContract[];       // current M5b
  periodSummaries: FinancePeriodSummary[]; // current M4b: monthly closed periods, ordered by end
  auditBuffer: JournalPosting[];        // bounded recent history only; current M4a-1/M4b uses `postings`
  nextPostingId: number;
  nextAccountId: number;                // current: deterministic derived-account allocator
  opening: OpeningBalanceRecord | null; // current: atomic opening-balance provenance
  closedThroughDay: DayIndex | null;    // current M4b: last closed period end, or null
}

interface FinancePeriodSummary {
  periodStartDay: DayIndex;
  periodEndDay: DayIndex;
  accountTotals: Record<Id, MoneySUSD>;   // pre-close trial balance, nonzero accounts only
  flowTotalsByKind: Record<string, MoneySUSD>; // the four current flow kinds; M4c fiscal totals are derived, not added
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

Prices are nominal SUSD per unit. The initial price model is incremental and bounded; it is not a full equilibrium solver. Calculate market imbalance using funded demand and sellable supply, with explicit behavior when the denominator is zero.

A provisional update structure is:

`imbalance = (fundedDemand - sellableSupply) / max(fundedDemand, sellableSupply, epsilon)`

`dailyChange = clamp(kappa * imbalance, -maxDailyChange, +maxDailyChange)`

`newPrice = clamp(oldPrice * (1 + dailyChange), lowerBound, upperBound)`

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
  `baseWage1900SUSDPerYear / daysInYear(civil year)`.
- Wage index, labor scarcity, productivity-wage adjustment, inflation, laws, and
  wage-productivity modifiers are not implemented.
- Wages are paid after market settlement from the employer operating account.
  Income is spendable only after settlement; same-day wages cannot fund the earlier
  market phase.
- If an employer cannot fund its obligation, it pays pro-rata up to available cash
  and reports the unpaid remainder. Unpaid wages are not a liability, debt, or
  negative balance in M3e.
- Every operational building owes
  `dailyUpkeepSUSDAtLevelOne × building.level` per settlement day, paid after
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

### 8.1 Accounting principles

V1 uses SUSD as the fixed unit of measurement and accounting denomination. M4a-1
keeps all accounting balances in nominal SUSD; M4a-2 adds currency identity and
SUSD-relative valuation but no native-currency balances or a parallel ledger. The
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
outcomes are unchanged. M4a-2 adds country/currency identity and SUSD-relative
valuation but does not change the ledger, create native-currency balances, or add
a second accounting book. M4b adds a monthly period close that recognizes the net
period result in owner equity and records an immutable monthly summary. M4c adds a
country treasury, daily income-tax withholding, a daily budgeted welfare transfer,
and the `income-tax`/`welfare-transfer` posting kinds (§5.4.3, D-048). M5b adds
country-to-country/country-to-household debt, interest, and explicit default
(§5.4.6, D-057). Banks, central banks, monetary issuance, corporate/consumption/
land/tariff taxes, annual close, and reopen/reversal are **not implemented**;
annual close and controlled corrections are planned in M7a, and inflation/FX/
monetary policy in M8a (§17.3).
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
- `FinanceState`: accounts, contracts, period summaries, monetary aggregates, and audit buffer. *(M4b/M4c baseline: accounts, postings, nextPostingId, nextAccountId, opening, periodSummaries, closedThroughDay; contracts/monetary aggregates/`World.history` future.)*

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
not assigned by this revision.

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

**Current M4c subset: one budgeted per-capita welfare transfer.** No
administration, military, education, healthcare, infrastructure, subsidy, debt
service, or colonial expenditure is implemented; there is no government
procurement demand (market priority tier 4) and no government employment. Debt
service is current in M5b (§17.3); the remaining expenditure work is not
assigned by this revision. Profit distributions and state-enterprise remittances
are transfers of recognized profit, not government expenditure, and are planned
in M5a.

**M4c welfare transfer (implemented, provisional).** The country's
`welfareBudgetSUSDPerYear` is a requested annual nominal expenditure target, not a
spendable pool. Its daily share is
`welfareBudgetSUSDPerYear / daysInYear(current civil year)`. The payable amount is
the lesser of that request and treasury cash available after the day's income-tax
receipts, so a funding shortfall reduces the transfer proportionally rather than
creating debt, arrears, or negative cash. Payable is allocated across the
country's pop blocks in proportion to population with a deterministic exact
remainder and paid through household `welfare-income` and country
`welfare-expense`; the economic recipient and effect are therefore explicit
(household cash available for subsequent needs demand). The shortfall is reported
for diagnostics and tests but is not persisted as a liability or counter.

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

**Status: current M5b public-debt subset; no banking, central bank, or market
pricing.** Country treasuries issue SUSD debt to another country treasury or a
pop-block household. Contracts persist version, issuer, holder, principal,
outstanding liability, coupon, issue/maturity, accrued interest, status, and arrears
start day (§5.4.6, D-057). The current rule is:

- The fiscal deficit is the accrued period result
  `welfare-expense + interest-expense - income-tax-revenue`. Borrowing proceeds are a
  financing inflow that increases cash and liability, never revenue. Principal
  repayment reduces cash and liability and is not ordinary expenditure. Interest
  accrues daily as an expense and payment reduces cash; neither is principal
  repayment.
- Refinancing retires the old contract and issues the replacement in one validated
  batch, showing both sides. Arrears and default are explicit contract statuses with
  a grace period and an explicit owner-equity write-down; no unrecorded gap exists.
- Month-end financing is constrained by the designated creditor's actual cash, the
  outstanding-principal ceiling, and the accrued deficit. An unfinanced deficit is
  reported, not booked as an invisible liability. M4c welfare liquidity shortfalls
  are unchanged.
- No debt-to-GDP target, market pricing, bank/central-bank holder, external investor
  pool, debt auction, or player/AI debt action exists.

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
and M4a-1 prices and balances are nominal SUSD market/accounting values. M4a-2
adds country/currency identity and a scenario-provided or explicitly unavailable
SUSD-relative valuation. It does not implement floating or managed exchange
rates, inflation dynamics, monetary policy, central-bank operations, gold
convertibility, regime transitions, pegged exchange rates, or currency
conversion in market settlement. `CurrencyValuation.susdPerUnit` is the SUSD
value of one unit of a currency; it is a valuation input, not by itself a peg.

All M4a-1/M4a-2/M4b monetary balances and quoted prices are stored in nominal SUSD.
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

### 10.2 Research work

Technology advances only through explicit research labor and funded institutional activity. Academics must be actual people employed in research/education institutions, or be assigned a documented share of research time. Education and institutional funding affect the number and effectiveness of researchers through defined staffing and service output.

For each active technology project:

- Record project-specific work completed and work required.
- Calculate daily work from assigned researchers, their literacy/qualification, institution effectiveness, available facilities, and funding.
- Deduct or record research inputs where the model requires material goods or operational costs.
- Complete the technology when the project’s required work is reached.
- Apply unlocks/modifiers deterministically on the effective date.

Accumulated project work is the record of labor already performed; it cannot be transferred freely between unrelated projects as a generic spendable currency. Research must not progress on days with no supporting research work.

### 10.3 Literacy and education transition

Literacy growth is generated by educational access, teacher availability, attendance, school funding, urbanization, household resources, and policy. Avoid applying a universal daily literacy increment without a defined educational mechanism. Population aging, migration, and age-structure change must affect national literacy aggregates through actual age-specific values.

---

## 11. Diplomacy, war, and territorial control

These systems are implemented in M10. Earlier milestones may define stable IDs and empty collections only where necessary.

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

---

## 12. Country AI

**Implementation status.** M6 implements deterministic country AI v1, persisted
AI goal state, shared player/AI action validation, and a bounded fiscal action
set. It is enabled by the M5 historical sample and disabled by legacy fixtures.
Construction queues, infrastructure/production priorities, laws, debt actions,
diplomacy, and military actions are **not** implemented because their underlying
systems are absent or outside the accepted M5b boundary (D-058).

### 12.1 Deterministic decision model

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

**Current M6 mapping.** Only priorities 1 and 2 have implemented actions. The AI
selects one of three persisted goals: `restore-solvency` (treasury below six
months of observed outlays, or observed annual outlays above observed annualized
income-tax revenue), `relieve-hardship` (at least 5% of own population with seven
consecutive unmet subsistence days, or population-weighted militancy at or above
0.15), or `maintain`. Solvency takes precedence. The relief target sets income
tax to at least a provisional 5% and welfare to 25% of observed annualized tax
revenue. Treasury reserves are a solvency buffer, not an ongoing spending target,
so the welfare target is stable once revenue is observed; a new welfare action is
suppressed unless the target changes by at least 10%. Solvency raises tax by one
percentage point toward a provisional 25% self-cap and cuts welfare to affordable
capacity. Missing pre-close revenue is treated as unknown, not zero. The goal persists in `Country.ai.currentGoalId`
until a later scheduled evaluation changes it. Priorities 3–7 have no implemented
action because construction, infrastructure priority, education, technology,
military, and diplomacy systems do not exist yet.

### 12.2 AI information and reproducibility

- An AI may use information available to the country it governs and public information defined as visible to players.
- It must not use hidden information or future events not available to a comparable player.
- It uses the same action validation rules as the player.
- Its decisions must be deterministic for a given state, seed, and evaluation day.
- Any stochastic choice must use keyed deterministic randomness with an explicit purpose identifier.
- Avoid AI re-planning that emits contradictory actions every tick. Goals persist until completion, invalidation, or a documented re-evaluation rule.

**Current M6 boundary.** The decision function receives only a
`CountryAIObservation`: own fiscal policy, own treasury cash, own region ids, own
population blocks and their need/unrest indicators, the latest closed
own-country fiscal totals, and own debt exposure. Other countries'
treasury/fiscal/debt state, other countries' blocks, household account balances,
future events, and the world seed are absent. The M6 rules use no random draw.
Countries and blocks are processed in ascending id order; rates are rounded to
six decimals and money to cents; no-op changes are suppressed. M6 tests mutate
hidden fields and assert that the governed country's observation and decision do
not change.

### 12.3 Initial action set

For M6, actions may include setting tax/spending policy, queuing a building, adjusting permitted laws once laws exist, and prioritizing infrastructure or production. Military and diplomatic actions are added only after their systems are implemented. M4c provides the authoritative `Country.fiscal` state those actions will mutate; it does not implement the action interface itself.

**Current M6 action.** The only implemented action is `set-fiscal-policy`, which
sets `Country.fiscal.incomeTaxRate` and `Country.fiscal.welfareBudgetSUSDPerYear`
atomically. `validateCountryAction` and `applyCountryAction` are the shared
player/AI path. A failed validation leaves the world unchanged. An AI proposal
that fails validation is counted in `diagnostics.invalidActionCount`, recorded in
the bounded warning buffer, and skipped. No building queue, law, infrastructure
priority, debt, diplomacy, or military action is accepted.

---

## 13. Presentation and mobile UX

### 13.1 Map

Use a stylized vector political map with approximately 500 tappable regions. SVG, Skia, or another suitable rendering approach may be evaluated; make the choice after a working performance prototype.

Requirements:

- Pan and zoom remain responsive during simulation.
- Region selection supports country and region inspection.
- Borders, ownership, occupation, and selected economic overlays remain legible at phone scale.
- Map geometry and simulation region IDs are connected through validated data IDs, not array-position assumptions.
- The map layer does not read the live mutable simulation object.

### 13.2 Charts

Provide compact charts/sparklines for population, GDP, government revenue/spending, prices, employment structure, literacy, and unrest as their systems become available. History is annual in v1, with 100 year-end samples for 1900–1999; the terminal boundary at 2000 may be shown as a separate endpoint/summary. Do not store per-day historical arrays for every chart.

Charts must label units, time window, and whether money values are nominal or real. A chart must not imply precision beyond the source/model calibration.

### 13.3 Screens

Initial M7 screens:

1. World Map
2. Country Dashboard
3. Budget
4. Population and employment
5. Markets and prices
6. Ledger / financial summary

Later screens add Politics, Technology, Diplomacy, and Military. Keep related details in drill-down views rather than crowding the main dashboard.

### 13.4 Mobile readability

- No numeric table should require more than six columns on a phone.
- Important status changes should be explained in plain language and linked to underlying causes.
- Show a concise summary first, with optional detailed breakdowns.
- Every key indicator should expose a definition, unit, scope, and update time.
- Avoid presenting every internal simulation variable as a player-facing meter.

### 13.5 Data flow and snapshots

The app subscribes to immutable snapshots emitted by the simulation worker at a target rate of up to 10 snapshots per second. A snapshot contains only the fields needed for the visible UI and selection context. The UI must never read or mutate the live simulation world.

Snapshot rate can be reduced under load. Dropping intermediate visual snapshots is acceptable; dropping simulation ticks or changing simulation results is not.

---

## 14. Technical architecture and persistence

### 14.1 Monorepo layout

```text
/packages
  /sim            pure TypeScript simulation; no RN/DOM/device imports
  /data           validated source tables and generated static definitions
  /sim-worker     worker/bootstrap and snapshot protocol, if needed by platform
  /app            Expo / React Native application
  /bench          headless performance and long-campaign harness
  /tests          unit, integration, invariant, serialization, and determinism tests
```

A dedicated `sim-worker` package is recommended if platform-specific worker setup would otherwise leak into `sim` or `app`.

The established local verification workflow is:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run bench
pnpm run ci
```

`pnpm run ci` is the aggregate local gate. It is not a claim that mobile/device performance has been verified.

### 14.2 Worker technology selection

Do not commit the entire architecture to a specific worker package before proving it works on current target versions of Expo, React Native, Hermes, iOS, and Android. The agent must first produce a small proof of concept that can:

1. Start the simulation runtime off the UI thread.
2. Import and execute the pure simulation package.
3. Receive a start/pause/step/action command.
4. Return an immutable snapshot and a serialized save.
5. Run on both iOS and Android targets.
6. Handle errors and shutdown without corrupting state.

Use the simplest maintained approach that passes these tests. Before adding dependencies, document compatibility, maintenance status, native configuration requirements, and why the package is needed. Do not port hot loops to C++/Rust/JSI until profiling shows a real bottleneck and a benchmark proves the expected benefit.

### 14.3 Thread protocol

The worker protocol must define versioned messages for:

- `START`, `PAUSE`, `STEP`, and speed changes.
- Player actions with stable IDs and validation errors.
- Snapshot delivery and sequence numbers.
- Save request/response.
- Load request/response and migration failures.
- Worker errors, fatal simulation errors, and shutdown.

Commands that affect simulation state are applied only at defined tick boundaries in a stable order. UI commands must not mutate the world directly.

### 14.4 Performance targets

Initial engineering targets, to be confirmed on a named reference device:

- Simulation tick p95: at most 8 ms for the full-scale reference world.
- UI: target 60 fps, with no persistent stutter when simulation runs.
- Cold start: under 2.5 seconds on the reference device, subject to measurement method.
- Peak memory: under 250 MB on the reference device.
- Save size: target under 4 MB for the initial full-scale world; revise only after measuring real state. **Current M6 measurement:** the opt-in full-campaign save is reported in README/D-058. The 4 MiB target is not met because M4b retains one pre-close trial balance per closed month; the history is bounded at 1200 summaries but compression/history compaction is not implemented.
- Sustained 10 days/second: battery drain target no more than twice measured idle drain under a controlled test.

Record device model, OS, build type, world size, warm-up, test duration, p50/p95/p99 tick times, snapshot rate, memory, and battery conditions. A Node benchmark is a fast regression test, not proof of mobile performance. Validate performance on-device in a release build. Current M2.1/M3f/M4b/M4c Node benchmarks (which also exercise worlds carrying the M4a-1/M4a-2/M4b/M4c state schema) do **not** evaluate or pass the mobile p95 target; its status remains **NOT EVALUATED**. The M4b close benchmark times only the period close, and the M4c fiscal benchmark times the integrated fiscal day; world cloning, setup, and hashing are excluded from both.

At high speeds, batch ticks only up to a small execution budget before yielding to the runtime. Batching may delay snapshots but must not change tick order or outputs. Do not use `performance.now()` inside the simulation package to decide game outcomes; wall-clock budgeting belongs in the driver.

### 14.5 State management

Zustand or an equivalent state store may hold:

- `simSnapshot`
- `uiSelection`
- `settings`
- loading/error state

The app may import snapshot types and protocol types. It must not import simulation implementation modules for UI-side calculations, except for a deliberately shared type-only module that has no runtime behavior.

### 14.6 Save system

- Serialize the authoritative state with the versioned serializer.
- Encode typed arrays explicitly; validate all numeric fields before saving.
- Compress the payload if measurement shows it is worthwhile.
- Save through a platform-appropriate storage layer, selected and tested for size, durability, and performance.
- Use an atomic/replace-safe save strategy, ideally keeping a last-known-good save until the new save is verified.
- Include checksum/integrity validation and a clear recovery message when a save is corrupt.
- Reject an unadvanced staged close state: serialization and hashing require `closedThroughDay === null || closedThroughDay < dayIndex` (§5.4.2).
- Test save/load mid-month, mid-year, after an event, after random draws, immediately after a month-end close once the day has advanced, and at the terminal boundary.

### 14.7 History and diagnostics

Persist annual samples only for long-range charts; avoid per-day history buffers for all fields. Maintain monthly summaries for finance and any detail needed by the Ledger UI. **Current M4b:** each closed month stores one immutable `FinancePeriodSummary` (pre-close trial balance plus the four gross flow totals) in `FinanceState.periodSummaries`; there is no per-day chart history and no `World.history` collection yet. Keep a bounded recent event/transaction audit ring for debugging. Expose optional debug counters for conservation errors, invalid states, allocation failures, and performance metrics.

---

## 15. Historical data and calibration

### 15.1 Dataset deliverables

The intended initial dataset consists of:

- `countries_1900.csv`: approximately 55–65 sovereign polities plus dependencies, with historical tags, names, sovereignty/overlord relationships, laws/regime defaults, and source provenance.
- `regions.csv`: approximately 500 regions with stable IDs, name, historical owner, area, resource caps, terrain, infrastructure, population totals, market membership, and source provenance.
- `pops_1900.csv`: region × profession population blocks, male/female age counts at the documented source resolution (single years where available; five-year groups otherwise with a documented deterministic within-band expansion), literacy, wealth/standard-of-living seed, and other initialized variables. Five-year bands used for reporting are derived, not duplicate authority.
- `goods.json`, `professions.json`, `buildings.json`, `technologies.json`, `laws.json`, and `needs.json`: static definitions and parameters.
- `calibration_targets.csv`: metric key, year, geography, definition, units, target value, tolerance, source URL/citation, access date, and confidence.
- `source_notes.md`: explanations of estimates, boundaries, revisions, missing data, and transformation steps.

**M5 current data scope:** the initial historical pipeline exists as
source-annotated JSON tables under `packages/data/data/historical/` with eight
authored 1900 polities (United States, United Kingdom, German Empire, France,
Russian Empire, Empire of Japan, British India, Brazil), 16 regions, 5 markets,
64 population blocks, 81 building instances, 8 currencies, an initial employment
table, calibration targets, and source notes. Population totals are rounded
source-referenced estimates; occupation composition, regional splits, age
structure, literacy/wealth, fiscal settings, building levels, and market
groupings are explicitly provisional. The sample is not a world total and does
not implement the full `countries_1900.csv`/500-region dataset. Currency
valuations are `unavailable`; no FX rates are invented. M5 does not claim
century-scale historical population or occupation-trend calibration because the
M3 recipes/needs are not historically calibrated and profession
promotion/demotion is not implemented (D-053).

The agent should generate schemas, validators, loaders, and fixtures, then provide a complete authored sample of eight varied polities and validated stubs for the remaining entities. Stubs must be explicitly marked incomplete; do not fabricate detailed historical data to make the world appear complete.

The exact eight sample polities should span industrialized, agrarian, resource-rich, and dependent political/economic conditions. Their borders, names, and status are historical data and must be verified against cited sources before being treated as final.

### 15.2 Calibration philosophy

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

### 15.3 Provisional aggregate targets

The values below preserve the initial design’s anchor points. Treat them as **provisional**, pending source verification and a consistent definition of each series.

| Metric | 1900 | 1950 | 2000 | Initial tolerance / note |
|---|---:|---:|---:|---|
| World population | ~1.65 B | ~2.5 B | ~6.1 B | Historical orientation only until date/source definitions are fixed; not a substitute for source-backed targets. |
| United States population | 76.2 M | 151 M | 281 M | ±2–5%, depending on the chosen historical series. |
| US nominal GDP, current USD | ~$20.7 B | ~$300 B | ~$10.3 T | ±10% for comparable definitions; 1900 reconstruction needs separately documented confidence. |
| US federal receipts, nominal USD | ~$567 M | ~$39 B | ~$2.0 T | ±10–15%; do not confuse federal receipts with all levels of government. |
| General-government revenue / GDP, selected industrialized economies | 6–10% | 20–30% | 30–50% | Broad target only; define tax/non-tax receipts and level of government before calibration. |

The present population source conventions are:

- OWID long-run world population, 1900 annual value 1,627,273,655 (treated as mid-year), with an OWID-derived January 1, 1900 estimate of 1,621,287,278. The campaign uses the latter.
- WPP 2024 1-January-1950 world population: 2,471,424,002. This is the WPP validation start. The OWID-derived January 1, 1950 value is 2,480,507,938; the approximately 9.08M difference is a disclosed source-splice/convention difference, not silently blended.
- WPP 2024 1-January-2000 world population: 6,129,943,964. OWID’s 2000 annual/mid-year value is 6,171,702,992, with an OWID-derived January 1 value of 6,130,354,660.
- Current M2.1 WPP-initialized validation: 4,041,822,105 at 1975 (+0.193% vs WPP) and 6,205,160,776 at 2000 (+1.227%). Age shares are within about 1.1 percentage points at 1975 and 0.55 at 2000.
- Current 1900 campaign: 6,715,972,921 at 2000, about +9.6% vs the OWID-derived January 1 source. This is a no-shock gameplay baseline with provisional pre-1950 composition, not a successful historical calibration and not proof of a correct no-shock counterfactual.

Population and GDP values in this table are not all equally certain. In particular, 1900 GDP comparisons may rely on historical reconstructions rather than a modern national-accounts series. The source notes must describe that limitation before the target becomes a binding test.

### 15.4 Employment-structure calibration

“Peasant share” must not be used ambiguously. The default statistic is:

`agricultural/peasant employment share = employed workers in the defined agricultural/peasant occupations / total employed civilian workforce`

Exclude dependents from the numerator and denominator. Define separately whether agricultural wage laborers count as peasants or laborers. Use country-specific baselines: the United States, United Kingdom, Germany, France, Russia, Japan, and other states differed substantially in 1900 and followed different trajectories.

The earlier draft proposed agricultural/peasant employment shares of roughly 30–40% in 1900, 10–15% in 1950, and below 5% in 2000 for an “industrialized” grouping. Treat these only as provisional hypotheses for a specifically named sample, not universal values: the metric and country grouping must be verified before they become acceptance tests. The prior service-employment anchors—roughly 25–30% in 1900, 45% in 1950, and 70% or more in 2000—are also provisional and require country-specific source verification.

The model should produce a broad shift from agricultural to industrial and then service employment in relevant countries. **Do not require monotonic decline on every simulated tick or in every scenario.** War, crisis, migration, policy, and territorial changes can temporarily reverse a trend. Acceptance tests should compare specified baseline anchor years and plausible ranges, not demand an implausibly smooth path.

**Current M5 limitation.** The eight-polity historical sample checks authored 1900 population levels against source-referenced targets and authored occupation structure against **provisional** household-composition ranges. It does **not** use the employed-worker statistic above because profession promotion/demotion is not implemented in M5 and the M3 recipes/needs are not historically calibrated. Century-scale occupation-trend claims are therefore explicitly not made; the provisional occupation targets are data-validation inputs, not evidence of a successful historical employment transition.

### 15.5 Data validation

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

---

## 16. Determinism, invariants, and test strategy

### 16.1 Randomness

Use keyed/counter-based deterministic randomness rather than one global mutable random stream. Each draw is keyed by a stable tuple such as `(worldSeed, dayIndex, entityId, purposeId, drawIndex)` and returns a reproducible value in `[0, 1)`.

- Every draw has a stable purpose identifier.
- A newly added random draw for one entity must not change unrelated entities’ random outcomes.
- Do not use `Math.random`, `Date`, `performance.now`, or external entropy inside `packages/sim`.
- The PRNG/hash algorithm and known-answer test vectors must be documented.
- A seed alone is insufficient if action input, data version, or simulation version changes; those must also be recorded in a reproducibility report.

### 16.2 Mandatory tests

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

### 16.3 Numeric safety

- Validate every external/data input.
- Reject NaN and infinity in authoritative state.
- Use explicit tolerances for floating-point invariant comparisons; do not apply arbitrary epsilon rules to integer IDs or counts.
- Apply clamping only where a model definition calls for it. Clamping must not conceal a conservation failure.
- Integer people/item counts remain non-negative integers. If rates yield fractional daily counts, retain the fractional remainder deterministically.
- Report invariant violations with entity IDs, day index, subsystem, and relevant quantities.

### 16.4 Conservation equations

At minimum, test these identities:

**Population:**

`populationEnd = populationStart + births - deaths + immigration - emigration`

Profession changes, annual ageing, internal migration, and regional ownership changes must not alter world population. Internal migration changes regional counts but nets to zero globally.

**Goods:**

`closingStock = openingStock + production + imports - domesticUse - exports - losses`

All forms of use, including intermediate inputs and final consumption, must be counted exactly once.

**Government cash:**

`cashEnd = cashStart + receipts + borrowingReceived + otherInflow - spendingPaid - interestPaid - principalRepaid - otherOutflow`

Accrued but unpaid items must be separately represented. Borrowing is financing, not revenue. **Current M4c:** `receipts` is daily income tax and `spendingPaid` is daily welfare actually paid; there is no borrowing, interest, or principal. A welfare funding shortfall is unfunded rather than accrued, so it is reported as a shortfall and is not a liability. Income tax is withheld only from cash actually received, so it creates no arrears.

**Financial postings:**

For each posted transaction, total debits equal total credits. Changes in assets, liabilities, income, and expense follow the defined account rules.

### 16.5 Benchmark fixtures

Provide at least three fixtures:

- **Minimal:** one country, one market, one region, a few pop blocks and buildings.
- **Representative:** eight authored polities and the initial target scale of regions/pop blocks.
- **Stress:** full target scale, maximum permitted pop blocks, active markets, dense employment assignment, and ongoing AI evaluations.

Benchmarks must state the exact seed, data version, tick count, hardware/runtime, and measurement procedure. Performance targets are not allowed to be “verified” on a different test scale without stating the difference.

**Current M5/M5a/M5b/M6:** the harness includes the eight-polity representative campaign (8 countries, 16 regions, 5 markets, 64 blocks, 81 buildings), a doubled-block/building stress fixture (128 blocks, 162 buildings), serialization/validation overhead, the monthly migration phase, the M5a month-end profit-allocation phase (close/clone excluded), a focused M5b debt-accrual/coupon phase over one month, and M6 AI evaluations in both the representative and stress fixtures. The opt-in `pnpm run bench:campaign` command executes all 36,524 economic ticks with AI enabled and reports per-tick p50/p95/p99, AI evaluation/action counts, bounded-state checkpoints, and the final save size. The default CI benchmark remains bounded; the full campaign is not part of `pnpm run ci`. The mobile p95 target remains **NOT EVALUATED** because no release build was run on the named reference device.

---

## 17. Build order and milestone acceptance criteria

Each milestone is a separate assigned task. Tests and acceptance criteria are prepared before implementation. Do not start the next milestone until the current one is complete or the designer explicitly accepts a documented exception.

**Implementation status.** M0–M5b and M6 are implemented and accepted (§17.1–§17.2d); M4's remaining unassigned finance work is not implemented. M7–M10 are planned. The intermediate stages M7a and M8a are planned additions in §17.3, not implemented milestones. No later stage is implied by the existence of its support type or by this plan.

| Scope | Status |
|---|---|
| M0, M1, M2/M2.1, M3a–M3f, M4a-1, M4a-2, M4b, M4c, M5, M5a, M5b, M6 | Implemented and accepted |
| Remaining M4 finance work not assigned in §17.3 | Not implemented |
| M7a, M8a | Planned, not implemented (§17.3) |
| M7–M10 | Planned, not implemented |

| Milestone | Deliverable | Definition of done |
|---|---|---|
| **M0** | Monorepo scaffold, TypeScript configuration, tests, benchmark harness, pnpm CI command | Repository installs reproducibly; `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run bench`, and `pnpm run ci` execute. No simulation behavior yet. |
| **M1** | Simulation core: world schema, calendar, keyed randomness, serializer, save versioning, empty-world no-op tick path | Calendar tests pass; exactly 36,524 processed campaign ticks reach the 2000-01-01 terminal boundary, whose tick is a no-op (there are 36,525 valid day indices including that boundary); repeat and save/resume hashes match; typed-array round-trip is verified. |
| **M2** | Population blocks, single-year sex-separated age state, age-specific fertility/mortality, needs baskets, wealth index in a single-region fixture | Single-year/sex population conservation passes; five-year bands reconcile as derived aggregates; births enter age 0 with documented sex split; deterministic fractional accumulation passes; no negative counts; unmet needs change the specified outcomes. Needs use the M2 annual-disposable-income fixture without savings drawdown or account mutation. Historical total calibration is reported separately and is not required for structural M2 completion. |
| **M2.1** | Population correction and demographic validation: authoritative single-year/sex state, exact annual ageing, ASFR fertility, sex-specific mortality, annual WPP 1950–2000 schedules, WPP-1950 validation scenario | Structural correctness, conservation, save/resume, and deterministic regression tests pass; annual age/sex and total validation against WPP is reported with absolute/relative differences. Post-1950 WPP validation is source-backed; 1900–1949 age structure/schedules remain provisional. The campaign's +9.553% 2000 difference is documented as a no-shock baseline limitation, not historical calibration success. Full pre-1950 historical calibration remains incomplete. |
| **M3** | Buildings, employment assignments, goods, production, market clearing, inventory, price updates, wages/profits, and an integrated economic tick in a small economy | Goods conservation passes; price-shock tests behave correctly; scarce-goods allocation is order-independent; no NaN/infinity; insolvent or unproductive buildings can fail without creating value. The accepted M3 baseline is delivered through stages M3a–M3f below. |
| **M4** | Finance/public-finance extension, staged: M4a-1 category-aware double-entry accounts and opening balances; M4a-2 country/currency identity, monetary arrangements, and SUSD-relative valuation; M4b monthly period close and finance summaries; M4c per-country treasury, daily income tax, and budgeted welfare transfers; remaining finance/public-finance work not assigned to a later stage (corporate/consumption/land/tariff taxes, broader non-debt government expenditure and services; milestone ownership not assigned by this revision) | M4a-1/M4a-2/M4b/M4c acceptance is recorded in §17.2. The remaining unassigned M4 revenue/expenditure definition of done stays future: all postings balance; no money appears without a defined source. The debt/interest/maturity, distribution/remittance, annual-close, and inflation/FX/monetary items formerly bundled into M4's eventual goal are reassigned by §17.3 to M5b, M5a, M7a, and M8a respectively; their acceptance criteria belong to those stages and are not M4 acceptance. M4 extends the M3a/M3e foundation; it does not introduce the first accounting interface. |
| **M5** | Multi-region/multi-country worlds, shared/trade markets, migration, labor mobility, initial historical data pipeline | Eight authored sample polities run together; data validator passes; population, goods, and finance invariants pass; occupation structure trends meet country-specific baseline ranges where data supports them. |
| **M5a** | Profit distributions to designated private owners/household capitalists or deterministic retention as business funds; actual state-owned-enterprise profit remittances to country treasuries through balanced postings (§5.4.5, §17.2b) | Ownership, timing, account semantics, and available-funds rules are explicit and deterministic; a distribution or remittance never exceeds distributable profit or available cash; no negative balances, unexplained money creation, or breakage of the accounting identity, determinism, and M4b close invariants; M5 ownership/enterprise structures are established or explicitly extended rather than assumed. **Implemented and accepted** (§17.2b, D-056). |
| **M5b** | Public debt and deficit financing: versioned debt contracts, issuance with matching asset/liability entries and actual cash transfers, daily interest accrual, monthly coupons, maturity/principal repayment, refinancing, explicit arrears, and default; deficit financing limited by creditor cash and an outstanding-principal ceiling (§5.4.6, §17.3, D-057) | Fiscal deficit, financing transactions, borrowing proceeds, interest expense, and principal repayment are separately and explicitly recorded; every issuance moves existing cash between identified issuer/holder accounts; outstanding liability reconciles; financing constraints and default consequences are defined; no unexplained money creation, invisible unpaid obligation, or premature full banking/central-bank system. |
| **M6** | Deterministic country AI v1, action validation, stress testing, simulation performance report | AI can govern the sample world without invalid actions or hidden-information access; full-campaign benchmark reports p50/p95/p99; no unbounded state growth; performance bottlenecks are identified. **Implemented and accepted** (§17.2d, D-058/D-059). |
| **M7** | Mobile worker proof of concept and playable app: map, snapshot bus, five core screens plus map | Release build runs on iOS and Android; pause/speed/actions/save/load work; UI reads snapshots only; target frame-rate and on-device tick performance are measured and reported. |
| **M7a** | *(Planned — not implemented; after M7, before M8.)* Annual finance summaries and annual-period boundaries, year-end closing entries consistent with the M4b monthly close, partial-year handling, and controlled auditable correction/reversal entries (§17.3) | Annual close is deterministic, atomic, validated, persisted, and reconciled; partial first/last campaign years are defined and the terminal boundary is excluded; corrections are posted as new auditable entries with provenance and never edit or delete closed history; monthly summaries, the accounting identity, and four-flow semantics remain intact. Not a prerequisite for the M0–M7 playable slice. |
| **M8** | Institutions, interest groups, laws, elections, unrest, instability, historical-shock/event content | Law/election outcomes follow documented prerequisites; a revolution or regime crisis can arise from simulated causes; scripted events are idempotent and have provenance. |
| **M8a** | *(Planned — not implemented; after M8, before M9.)* Inflation/price-level measurement with an explicit basket, weights, and time window; exchange-rate dynamics built on existing country/currency identities and valuations; defined monetary-policy authority and controls with explicit causal mechanisms and balanced money/credit accounting (§17.3) | Measure, basket, weights, window, timing, bounds, persistence, and tests are documented; policy effects have explicit causal mechanisms rather than arbitrary scalar adjustments; any money-supply or credit change has balanced accounting counterparts; prerequisites not delivered by M8 are recorded rather than hidden; no unrestricted issuance, full banking system, or elaborate capital markets are presumed. |
| **M9** | Technology tree, research staffing/work, education and literacy mechanics | Acyclic tree validates; tech progress occurs only from assigned work; unlocking technology measurably and correctly changes the specified systems; literacy outcomes match the test scenarios. |
| **M10** | Diplomacy, treaties, armies, mobilization, combat, casualties, occupation, peace | Two-country conflict resolves end-to-end; casualties and mobilization reconcile with population/workforce; equipment and finance are consumed correctly; peace/territorial changes update all affected systems. |

**Vertical slice:** M0–M7. The slice is complete only when the player can start a scenario, inspect the country/world, change available economic policies, advance/pause time, save/load, and observe deterministic, causally connected consequences on a device. M5a and M5b are finance stages inside this build order; M7a and M8a are post-slice stages (M7a before M8, M8a before M9) and are **not** prerequisites for the initial playable release.

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
work is not implemented and its ownership is not assigned by this revision.
M5a profit distributions/state-enterprise remittances and M5b debt/interest/
maturity are implemented and accepted (§17.2b/§17.2c). Annual close and controlled
corrections and inflation/FX/monetary-policy work remain planned in §17.3 (M7a and
M8a respectively) and are not implemented.

| Stage | Deliverable | Acceptance boundary | Status |
|---|---|---|---|
| **M4a-1** | Category-aware double-entry accounts, normal-side balances, opening balances, recognition legs | Account categories/subtypes validate; opening balances apply once with provenance; postings balance and the accounting identity holds; M3 cash outcomes and producer/household settlement totals are unchanged; serialization, determinism, and rollback tests pass. | Accepted |
| **M4a-2** | Country/currency identity, monetary arrangements, SUSD-relative valuation, country-region ownership | Runtime `countries`/`currencies`/`currencyValuations` validate, serialize, hash, and clone; `own`/`adopted` rules validate; foreign adoption and one-issued-currency restrictions are enforced; region ownership is authoritative in `Country.regionIds`; conversion direction and unavailable-valuation errors are tested; no M3/M4a-1 economic outcome changes. | Accepted |
| **M4b** | Monthly period close, immutable finance summaries, semantic posting matrix, internal `period-close`, staged-versus-published close boundary | Economic worlds close on civil month-ends after settlement, needs/militancy, and month-end wealth; the first period may be partial and duplicate/gap/terminal cases reject; summaries capture the pre-close trial balance and the four mapped gross flows; revenue/expense opening balances are zero and the semantic matrix is enforced for single, batched, and persisted postings; closing entries zero revenue/expense exactly, close into existing owner equity in deterministic order, remain cash-neutral, and preserve the accounting identity; missing owner equity fails before mutation; the close is atomic and staged; published validation/serialization/hashing/deserialization reject an unadvanced close; summaries and `closedThroughDay` round-trip, clone, hash, and validate; schema-7/simulation-0.7.0 saves are rejected; deterministic and benchmark coverage passes. | Accepted |
| **M4c** | Per-country treasury and fiscal accounts, `Country.fiscal` policy state, daily income tax on actual wages, daily budgeted per-capita welfare transfer with proportional shortfall, fiscal posting kinds and semantic matrix, wealth-input refinement | Country and household fiscal account sets validate; treasury opening cash applies once with provenance and balance-sheet counterparts; fiscal values, treasury references, id collisions, and region-ownership gaps reject before mutation; income tax equals the flat rate on actual received wages and cannot exceed them or household cash; welfare uses the civil year's day count, allocates exactly per capita, and reduces proportionally when treasury cash is insufficient without debt, arrears, or negative cash; fiscal postings are cash-neutral, balanced, structurally require their recognition/cash legs, are semantically validated for single/batched/persisted forms, and close into country equity in deterministic order; the fiscal phase is staged on a finance clone and publishes only after complete staged validation, rejects duplicate/stale/wrong-day/terminal execution before mutation, and leaves the original state unchanged on a post-posting failure; transient settlement/needs/fiscal cash fields are phase-qualified and `governmentPeriodTotals` derives government totals from a frozen summary; M4b summary shape and four flow kinds are unchanged; M2/M3/M4a/M4b behavior is preserved for zero-fiscal and countryless worlds; schema-9/simulation-0.9.0 round-trip, determinism, save/resume, and benchmark coverage pass; schema-8/0.8.0 saves reject. | Accepted |

M4b did not add taxes or government finance, and M4c adds only the fiscal subset
described in §5.4.3 and §8.3–§8.4. Neither stage adds corporate, consumption,
land, or tariff taxes, broader government services or procurement, debt, interest,
banks, monetary issuance, native-currency balances, FX, inflation, annual close,
reopen/reversal, or UI. Those deferred systems are not silently folded back into
M4: §17.3 assigns the adopted subset to planned intermediate stages, and the rest
remains unassigned future work.

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

### 17.3 Intermediate finance stages (M5a/M5b accepted; M7a/M8a planned)

**Status: M5a and M5b implemented and accepted; M7a and M8a planned and not
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

**Placement:** after M7, before M8. **Status:** planned, not implemented.

**Planned scope.**

- Annual finance summaries and explicit annual-period boundaries.
- Year-end closing entries and account treatment consistent with the M4b monthly
  close semantics.
- Correct handling of partial years at campaign boundaries.
- Controlled, auditable correction/reversal entries that preserve historical
  journal integrity rather than editing or deleting previously posted
  transactions.
- Deterministic ordering, atomicity, validation, persistence, and accounting
  reconciliation.

**Boundaries and requirements.** Annual periods must be explicit and validated:
the first and last campaign years may be partial, each later annual period starts
after the previous year-end, and the terminal `2000-01-01` boundary is not a
processed year. Year-end closing must follow the M4b rules (zero revenue/expense
into existing owner equity, cash-neutral, deterministic owner order, accounting
identity preserved) and must not re-run daily tax, welfare, or market flows. A
correction or reversal is a new posting with provenance identifying the original
entry and the reason; closed monthly or annual summaries are immutable and are
never rewritten. If a correction must affect a previously reported period, the
stage must define the explicit presentation rule rather than silently editing
history.

**Placement rationale.** M7a completes the accounting lifecycle after the M0–M7
playable vertical slice. It is **not** a prerequisite for the initial playable
release and must not block M5–M7. M8 follows once annual reporting and corrections
are defined.

**Non-goals.** M7a does not add inflation adjustment, real/nominal restatement,
tax assessment, audit institutions, or a UI ledger. It does not rewrite M4b
monthly summaries or add new M4b flow kinds.

#### M8a — Inflation, FX dynamics, and monetary-policy foundations

**Placement:** after M8, before M9. **Status:** planned, not implemented.

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
country/currency identities; `susdPerUnit` remains a valuation input, not by
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

### 17.4 Dependency plan and slice boundary

The intended order is binding for planning, not an authorization to implement
several stages at once:

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

- M4c supplies the initial treasury, income-tax, and welfare-transfer behavior.
- M5 (accepted) supplies the multi-country economic, migration, labor-mobility,
  and historical-data foundation. Its multi-market/ownership structures are the
  starting point for later enterprise and finance work.
- M5a (accepted) establishes defined private profit distributions, retained-profit
  accounting, state-enterprise ownership, and state-enterprise remittances on the
  ownership structures M5 delivers.
- M5b establishes public debt and deficit-financing behavior before the AI
  milestone.
- M6 (accepted) delivers deterministic country AI v1 and shared action validation;
  M6 and M7 together deliver the first playable mobile vertical slice.
- M7a completes annual accounting after the first playable slice.
- M8 establishes political institutions and laws.
- M8a adds monetary systems on top of those institutional and multi-country
  foundations.
- M9 and M10 retain their existing technology and diplomacy/war goals.

The **vertical slice remains M0–M7**. M7a and M8a are post-slice stages and are
not prerequisites for the initial playable release. M5–M7 are not automatically
blocked on the later monetary systems; M8a may be deferred or narrowed if its
prerequisites are not met, provided the gap is recorded. M5a, M5b, and M6 are
current; M7a and M8a are planned and not implemented; no current runtime behavior,
save field, schema version, or benchmark gate may be inferred from this plan.

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

---

## 20. Decision register and handoff procedure

### 20.1 Design decisions already fixed for v1

The following choices are resolved in this version:

1. **Population grouping:** aggregate region × principal occupation blocks, including dependents, with authoritative single-year male/female age state (`Uint32Array(81)`; index 80 = 80+) and derived 17 five-year reporting bands.
2. **Employment:** explicit quantitative assignments; no single `employedAt` per pop block.
3. **Market stock:** physical inventory requires storage capacity; the Warehouse is included in v1.
4. **Accounting unit:** SUSD is the fixed unit of measurement/accounting denomination, not a national currency. M4a-1 balances are nominal SUSD. M4a-2 adds currency identity and scenario-provided or unavailable SUSD-relative valuation; it does not implement dynamic FX, inflation, monetary policy, native-currency balances, or currency conversion in settlement. Future regime/FX effects remain aggregate and simplified.
5. **Accounting integrity:** financial flows use balanced double-entry postings. M4a-1 adds category-aware accounts, normal-side balances, recognition legs, and opening balances. M4b adds the monthly period close, immutable monthly finance summaries, the semantic posting matrix, and the internal `period-close` kind (§5.4.2, D-047). M4c adds country treasury and fiscal accounts, the cash-neutral `income-tax` and `welfare-transfer` kinds, and fiscal close into country equity (§5.4.3, D-048). Annual close and controlled correction/reversal entries are planned in M7a; long-term history compaction remains future.
6. **Randomness:** keyed/counter-based deterministic random draws, not one shared mutable PRNG stream.
7. **Daily ordering:** the pipeline in §4.2 is binding unless changed with tests and a decision record. In particular, M3d market clearing includes bounded price adjustment before M3e settlement; settlement uses established transaction prices (D-043). Moving price adjustment after settlement requires a new decision and regression tests.
8. **Dependency markets:** dependencies initially share the overlord’s market unless data, event, or policy specifies another customs zone; transfers remain separate recorded flows.
9. **Wealth level:** a cached/smoothed index per pop block, not money and not an independently spendable resource. Monthly update uses the provisional income convention in §6.5; M4c includes welfare in the income basis and income tax in mandatory payments; an exact trailing-month average is not implemented.
10. **Buildings:** physical instances are located in regions and owned by private or state accounts. Current M3 baseline instances are private only.
11. **Historical calibration:** target values are provisional until metric definition, date convention, and source provenance are complete. Post-1950 WPP validation is source-backed; 1900–1949 population composition and schedules remain provisional; the 1900 campaign is not a historical-validation success.
12. **Performance:** Node benchmarking is diagnostic; mobile performance is unverified and must be confirmed on a named reference device in a release build. No mobile target has passed. The mobile p95 target is **NOT EVALUATED**. M6 executes a full 36,524-tick Node campaign in opt-in mode and reports p50/p95/p99, but it remains a Node diagnostic.
13. **M2-only finance fixture:** on the M2-only path, needs are funded from annual disposable income only, with no savings drawdown and no account mutation. M3f economic worlds instead use opening household cash and actual settlement; the full intended model remains household financial assets plus settled income less mandatory payments.
14. **Economic-day atomicity:** for worlds with buildings or markets, the complete day is staged on a structural clone and published only after all phases and final validation succeed. The M4c fiscal batch is itself atomic. The M2-only path is separate.
15. **Catalog scope:** the current M3 data subset is eight goods and eight building types; the fifteen-good/thirteen-building v1 target remains design intent, not current completeness.
16. **Country and currency identity:** M4a-2 uses `World.countries`, `World.currencies`, and `World.currencyValuations`; `Country.monetary` is the sole domestic monetary arrangement, `Currency.issuer` is issuer identity, and `Country.regionIds` is the sole country-to-region ownership mapping. There is no `Region.countryId`, `Country.currencyId`, or `fxToUSD`. D-044/D-045 record the approved SUSD/currency decisions. The one-issued-currency limit is a current scope restriction, not a permanent design commitment; the foreign-adoption requirement is a current M4a-2 validation rule recorded in D-045.
17. **Government fiscal policy:** M4c makes `Country.fiscal` (`incomeTaxRate`, `welfareBudgetSUSDPerYear`) and `Country.treasuryAccountId` authoritative. The rate is a provisional hard-bounded flat tax on actual wages, not law-bounded; collection efficiency is fixed at 1.0; welfare is a single budgeted per-capita transfer with proportional funding reduction. D-048 records the approved scope, timing, and limitations. M5a adds scenario-initialised `World.profitDistribution` and balanced private distributions/state-enterprise remittances (D-056); it does not make state receipts income-tax revenue. M5b adds scenario-initialised `Country.debt`, versioned contracts, deficit financing, interest, maturity/refinancing, arrears, and explicit default (D-057); borrowing is not revenue and principal repayment is not expenditure. M6 adds the shared `set-fiscal-policy` player/AI action and `World.countryAI`/`Country.ai` state (D-058); the action changes only the two M4c fiscal fields and creates no money or posting. Broader taxes and expenditure categories remain future and partly unassigned; annual close and controlled corrections are planned in M7a, and inflation/FX/monetary-policy foundations in M8a (§17.3). Those remaining planned stages are not implemented.
18. **Monetary precision and result phases:** authoritative SUSD uses continuous binary64 arithmetic in a fixed order with no cent quantization; `MONEY_TOLERANCE_SUSD = 1e-6` is an invariant tolerance, not a rounding operation. Transient settlement, needs, and fiscal cash fields are phase-qualified; the authoritative ledger is final cash. D-049 records the policy and its known-answer/residual rules.
19. **Multi-region/multi-market ownership and access:** `Country.regionIds` owns regions; `Market.regionIds` owns market membership and `Region.marketId` is validated to it; one market per country and one market per region in M5. Each market is cleared once with market-scoped production/storage/prices/inventory; shared-market regions pool once. Inter-market trade, tariffs, cross-market transport, and a rest-of-world trade account are not implemented. `Country.immigrationOpen` is provisional scenario state controlling cross-country migration and cross-country employment; internal migration/labor is unrestricted and emigration is unrestricted in M5. D-051/D-052 record the rules and non-goals.
20. **Historical data pipeline:** the M5 sample is eight authored 1900 polities in source-annotated tables with a deterministic validator/loader. Population totals are rounded source-referenced estimates; occupation composition and other structure are provisional. No century-scale historical population/occupation-trend calibration is claimed, no FX rates are invented, and no simulation code reads calibration totals to force outcomes. D-053 records the contracts and limitations.
21. **Country AI:** M6 makes `World.countryAI.enabled` a scenario-provided policy and `Country.ai` the fixed-size persisted schedule/goal state. The AI decision function receives only `CountryAIObservation`; it has one action, `set-fiscal-policy`, shared with a player through `validateCountryAction`/`applyCountryAction`. The AI is deterministic, uses no random draw, and never borrows, issues money, or mutates debt. Construction, infrastructure priority, laws, diplomacy, and military actions remain unimplemented. D-058 records the rules and non-goals; D-059 records the hot-path summary-validation optimization.

### 20.2 Remaining designer decisions

These are intentionally left open because they depend on desired gameplay depth rather than technical correctness. Use the stated default until the designer chooses otherwise:

1. **Campaign victory/end state:** default is a sandbox with a historical end-of-century report, not a mandatory victory condition.
2. **Player country selection:** default is any fully authored sovereign polity in the selected scenario; incomplete stubs are not playable until validated.
3. **Ironman/reload restrictions:** default is unrestricted save/load, with no Ironman mode in v1.
4. **Historical deviations:** default is a baseline event set that allows outcomes to diverge; no forced “railroad” restoration after an alternate outcome unless an event explicitly requires it.
5. **Monetary depth beyond v1:** default is the fixed-SUSD measurement model with M4a-2 currency identity and SUSD-relative valuation; dynamic FX, inflation, monetary policy, central banking, detailed local denominations, and banking instruments remain deferred and are not current M4a-2 behavior. M8a is the planned stage for inflation measurement, exchange-rate dynamics, and monetary-policy foundations, but it is not implemented and any missing prerequisite must be recorded.
6. **Monthly-wealth income window:** the current convention uses current-day actual settled wages annualized by the civil year because the GDD does not define a monthly window and no accumulator exists. An exact trailing-month average requires an authoritative per-block income accumulator and a schema/save-format change. The default remains the documented provisional convention until the designer chooses a measurement window and migration policy.

The agent must not expand these topics autonomously during early milestones. It may add proposals to `DECISIONS.md` for designer review.

### 20.3 Handoff procedure

For every agent session:

1. Provide this GDD plus only the sections relevant to the assigned milestone.
2. State the current milestone and its required deliverables.
3. Ask the agent to inspect the repository and produce/update the tests first.
4. Require an implementation plan that identifies files, interfaces, tests, and assumptions before large code changes.
5. Require the completion report defined in §18.4.
6. Review any `DECISIONS.md` items and test failures before assigning the next milestone.

**Initial task:** for a new project, start with M0 and M1 only, using §§3–5, §§14, 16–18 as binding references. The first deliverable is a tested simulation foundation, not the economy or UI. For the current repository, **M0/M1/M2/M2.1/M3a–M3f/M4a-1/M4a-2/M4b/M4c/M5/M5a/M5b/M6** are the accepted baseline; the next milestone must be assigned explicitly from §17 and must not be inferred from this document alone. The remaining M4 finance work, the planned intermediate stages M7a/M8a, and all later milestones are not started and must not be inferred.

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
- **SUSD:** the simulation's fixed unit of measurement and accounting denomination. It is not a national currency, necessarily an actual U.S. dollar, or a promise of constant purchasing power. Its definition is fixed; nominal SUSD values are distinct from future real/inflation-adjusted values.
- **Currency issuer:** the entity that issued a currency: a simulated country, an explicitly represented foreign issuer, or a future union. Adoption does not change issuer identity.
- **Domestic monetary arrangement:** a country's sole `own` or `adopted` selection of a currency for domestic use; it is not the same as issuer identity.
- **Currency valuation:** the single `CurrencyValuation` record for a currency, either specified (`susdPerUnit`, `setOnDay`, scenario source) or explicitly unavailable. It never defaults to parity.
- **SusdPerCurrencyUnit:** the SUSD value of one unit of a currency. It is a valuation input, not by itself a peg; it is serialized as a plain JSON number and branded in code.
- **Nominal SUSD:** an amount measured in the fixed SUSD unit without inflation adjustment.
- **Real purchasing power:** a future derived measure of what nominal SUSD can buy, using a documented price index or reference period; it is not the same as nominal SUSD.
- **Country-region ownership:** the authoritative mapping in `Country.regionIds`; a region may be unassigned, and there is no `Region.countryId`.
- **Finance period summary:** the immutable `FinancePeriodSummary` recorded at a monthly close: inclusive period start/end, the pre-close trial balance of nonzero accounts, and the four mapped gross period-flow totals.
- **Period close:** the M4b month-end operation that captures a finance period summary, zeroes revenue and expense accounts with closing entries into existing owner equity, and advances `FinanceState.closedThroughDay`.
- **Closed-through day:** `FinanceState.closedThroughDay`, the inclusive end day of the most recently closed period, or `null` before the first close. A published world requires it to be `null` or earlier than `world.dayIndex`.
- **Staged close / published close:** a staged close is the in-progress result on a copied finance state and may temporarily have `closedThroughDay === world.dayIndex`; a published world requires `closedThroughDay === null || closedThroughDay < world.dayIndex`.
- **Semantic posting matrix:** the D-047/D-048 rule set that fixes which account subtypes each transaction kind may debit or credit; it applies to revenue and expense lines in single, batched, and persisted postings.
- **Fiscal policy:** the M4c provisional `Country.fiscal` state: a flat dimensionless `incomeTaxRate` on actual wages and a nominal annual `welfareBudgetSUSDPerYear` expenditure target. It is scenario-initialised state, not a spendable pool, and is not law-bounded or action-mutable in M4c.
- **Treasury:** the country-owned `treasury-cash` asset account that receives income-tax proceeds and pays budgeted welfare. Its balance is authoritative cash, not a capacity or policy pool.
- **Welfare shortfall:** the difference between a country's requested daily welfare budget share and the amount actually payable from treasury cash. It is reported for diagnostics and is not a debt, arrear, or liability in M4c.
- **Technology project work:** cumulative record of research labor applied to one specific technology.
- **Tick:** one simulation update for one civil day.
- **Trailing-month income average:** a monthly average of household income over the preceding civil month. M3f does **not** implement this; its monthly wealth convention annualizes one day's actual settled wages.
- **Current implementation:** the behavior actually delivered and tested by the accepted M0–M4c baseline, as distinct from provisional rules and future requirements.
- **Planned intermediate stage:** one of M7a or M8a in §17.3. These stages extend the roadmap and are not implemented; they do not change the accepted M0–M5b baseline or the M0–M7 vertical slice boundary. M5a and M5b are implemented and accepted (§17.2b/§17.2c).
- **Whole-day staging:** running all phases of an economic day on a structural clone and publishing it only after every phase and final validation succeeds.
- **Vertical slice:** the smallest playable end-to-end version that proves the complete product path rather than only isolated systems.

---

**End of document.**
