# CENTURY — GRAND STRATEGY 1900–2000

**Working title:** *Century*\
**Document type:** Game Design Document and Agent Implementation Specification\
**Version:** 2.2\
**Revision date:** 2026-10-25\
**Target platform:** iOS and Android\
**Application stack:** React Native / Expo, subject to a worker-runtime proof of concept\
**Simulation period:** 1900-01-01 through the boundary at 2000-01-01\
**Simulation resolution:** One simulated civil day per tick

> **v2.2 alignment note.** This revision supersedes v2.1 as the authoritative
> specification. It records the accepted **M0–M3f** implementation baseline:
> the M1 foundation, M2/M2.1 population and demographic model, and the M3a–M3f
> economy stages through the integrated daily economic tick. It does not claim
> that the complete v1 design, the full economic model, or later milestones are
> implemented. The revision (a) resolves the M3d price-update/M3e settlement
> ordering explicitly (D-043), (b) records the M3f whole-day staging and
> publication rule, (c) states the provisional monthly-wealth income convention
> and the unimplemented trailing-month average, and (d) separates current M3
> behavior from provisional rules and future economic requirements. The broader
> vision, historical goals, future-system design, determinism, conservation, and
> scope-control rules remain in force.

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
| Treasury accruals | Daily | Record revenue and expenses as they arise. |
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

The economic day follows one documented update order. The current M3f order is
binding for economic worlds:

1. **Validate boundary and day.** If the campaign has reached the terminal
   boundary, do not process another day. Validate the world and explicit context.
   *(Current implementation.)*
2. **Apply scheduled events and effective policy changes.** An event must apply at
   most once unless explicitly defined as recurring. *(Future system; currently a
   no-op. No event or policy system is implemented.)*
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
6. **Calculate market opening state.** Record opening stock, storage capacity,
   prices, and the funded cash available to buyers. *(Current M3d/M3f
   implementation for the single M3 market.)*
7. **Post production-input demand.** Buildings calculate feasible input needs from
   current capacity, staffing, condition, and opening inventory. The day first
   attempts full desired production demand, allowing M3e's atomic same-batch sales
   receipts to fund input purchases. If that attempt would overdraw a buyer, the
   staged day is restored and production demand is retried with each building's
   input cost capped by opening operating cash. *(Current M3c/M3d/M3e/M3f
   implementation.)*
8. **Produce goods.** Execute production using inputs actually allocated. New
   output becomes available to the market for final demand on the same day, but
   cannot serve as an input to another production stage until the next tick. This
   avoids order-dependent same-day production chains. *(Current M3c/M3d
   implementation.)*
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
    implementation for those flows. Dividends, taxes, government procurement,
    transfers, interest, and debt are future systems.)*
12. **Accrue finance and settle due contracts.** Accrue interest, handle monthly
    settlements and bond maturities when due, and record any borrowing, default,
    or reserve change. *(Future system; not implemented. There are no debt
    contracts, interest accruals, taxes, or government finance in M3f.)*
13. **Update cadence-due indicators.** Apply the monthly wealth update when the
    civil month ends, using the convention in §6.5. *(Current M3f monthly wealth
    only. Other daily/weekly/monthly macroeconomic indicators and history samples
    are future systems.)*
14. **Record history and diagnostics.** Update annual samples at the specified
    boundary, invariant counters, and compact audit summaries. *(Invariant and
    diagnostic counters exist; annual history and historical-event recording are
    future systems.)*
15. **Advance `dayIndex`.** Move to the next civil day or the terminal boundary.
    *(Current implementation.)*

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
inventory, prices, finance, postings, needs indicators, wealth, and calendar state
mutate only the staged world. The staged world is published to the caller's world
object only after every phase and final validation succeeds. A failure leaves the
original world, its hash, and its serialized representation unchanged. The M2-only
path retains its existing population-only behavior and does not use the M3f
economic staging path.

**M2-only and economic-world distinction.** A world with no buildings or markets
uses the M2-only path: ageing, daily demography, the M2 needs fixture, daily
militancy, optional month-end wealth, and one calendar advance. A world with
buildings or markets requires explicit economy and population definitions and uses
the M3f economic path above. Economic worlds do not use the M2 needs fixture.

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
- Monthly systems should have explicit due checks, not independent timers. **Current M3f:** monthly wealth runs on the last civil day of the month after needs and daily militancy. Other monthly finance, political, and history systems are future work.
- Accruals remain daily even when payment settles monthly. A monthly settlement must not duplicate or omit accruals. *(Future finance systems; M3 has no interest or debt accruals.)*

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
type MoneySUSD = number;      // nominal simulated USD accounting unit
type Rate = number;          // normalized ratio, normally 0..1
type Count = number;          // non-negative integer persons, jobs, or items
type IndexValue = number;     // documented derived index; range specified per field
```

`SUSD` is the shared **unit of account** for v1, not a claim that every country uses dollars. The monetary model records counterpart financial entries in SUSD-equivalent terms. Currency regime and FX indicators influence cross-market prices, reserves, trade, and capital flows, but v1 does not simulate separate banknotes and local-currency denomination for every financial account. This is an explicit scope boundary, not a license to create unexplained money.

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
  countries: Country[];                // future systems may be empty
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
  countryId: Id;
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
  id: Id;
  tag: string;
  name: string;
  sovereign: boolean;
  overlordId: Id | null;
  capitalRegionId: Id;
  regionIds: Id[];
  treasuryAccountId: Id;
  laws: Record<LawSlot, Id>;
  currency: CurrencyState;
  institutions: InstitutionState;
  technology: TechnologyState;
  interestGroups: InterestGroupState[];
  ai: AIState;
  statsCache: CountryStats;
}

interface CurrencyState {
  regime: 'gold' | 'brettonWoods' | 'float';
  fxToUSD: number;                    // local currency units per USD, as an index input
  inflationIndex: number;              // 1.0 at the scenario's 1900 base date
  goldReservesOunces: number;
  centralBankAccountId: Id;
  moneySupplySUSD: MoneySUSD;          // derived monetary aggregate in SUSD-equivalent terms
}

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

**Current schema-5 baseline (M0–M3f).** The code block above is the target
contract, not a claim that every field exists. The accepted schema-5 `World`
contains `schemaVersion`, `simVersion`, `dataVersion`, `scenarioId`, `dayIndex`,
`startDayIndex`, `seed`, `regions`, `popBlocks`, `buildings`, `employment`,
`employmentDirty`, `markets`, `finance`, and `diagnostics`. It does not yet contain
`countries`, `treaties`, `armies`, `eventQueue`, or `history`. Current
`BuildingInstance` uses `ownerAccountId` and `operatingCashAccountId` rather than
the target `ownerCountryId`/`jobsFilledByProfession`; employment lives in the
explicit assignment collection. Current `Market` stores authoritative `stockLots`
plus `regionIds` and `priceSUSD`, not the target aggregate flow arrays. Current
`FinanceState` has `accounts`, `postings`, and `nextPostingId`; debt contracts,
period summaries, and the target audit-buffer shape are future. These are
implementation boundaries, not permission to omit conservation or serialization.

### 5.5 Minimum supporting contracts

The `World` interface above references supporting types so the core package can
compile before later systems are implemented. Keep these types small; extend their
fields only when their milestone begins. Future-system collections may be empty,
but types must be real rather than `any` placeholders. The current M0–M3f schema is
described in the preceding baseline note; later-system collections are added when
their owning milestone begins.

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
  ownerKind: 'popBlock' | 'building' | 'country' | 'centralBank' | 'bank' | 'foreign' | 'system';
  ownerId: Id | null;
  accountKind: string;                 // validated account-category key
  balanceSUSD: MoneySUSD;
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
  issuerCountryId: Id;
  holderAccountId: Id;
  principalSUSD: MoneySUSD;
  annualCouponRate: Rate;
  issueDay: DayIndex;
  maturityDay: DayIndex;
  status: 'active' | 'repaid' | 'defaulted' | 'restructured';
}

interface FinanceState {
  accounts: FinancialAccount[];
  debtContracts: DebtContract[];
  periodSummaries: FinancePeriodSummary[];
  auditBuffer: JournalPosting[];        // bounded recent history only
  nextPostingId: number;
}

interface FinancePeriodSummary {
  periodStartDay: DayIndex;
  periodEndDay: DayIndex;
  accountTotals: Record<Id, MoneySUSD>;
  flowTotalsByKind: Record<string, MoneySUSD>;
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
- Keep the finance audit buffer bounded. Long-run finance history belongs in period summaries.
- Later military/diplomacy types may grow, but empty M1 collections must not cause fake behavior or create daily work.

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

**Current M3f implementation convention (provisional):** on the last civil day of
each month, after needs counters and daily militancy, the economic day updates
wealth through the existing M2.1 monthly wealth function. For this update,
`perCapitaIncome` is the block's **actual settled wage receipts on that day**
divided by block population and annualized by the actual civil-year length
(365/366 days). `subsistenceBasketCost` is the corresponding **annual** cost of
the per-capita subsistence basket at current post-market prices, using the same
civil-year length. Household cash balances are **not** treated as income.
Mandatory payments are zero because M3f has no taxes or other mandatory household
payments.

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

### 6.8 Social mobility and migration

Promotion/demotion is represented as population flows between blocks; it must not create or remove people. Promotion requires qualification thresholds such as literacy and wealth, plus available job slots or another documented economic cause. Training costs are real expenses paid to education/service providers or recorded as defined household costs.

Initial causal mechanisms:

- **Vacancy pull:** available job slots attract qualified workers.
- **Agricultural push:** underemployment, mechanization, and rural/urban wage gaps can move people from Peasants to Laborers or other professions.
- **Qualification gate:** literacy, schooling access, wealth, and legal restrictions control entry to qualified work.
- **Internal migration:** people may move to regions with higher expected welfare or job opportunities, subject to transport, housing, laws, and migration friction.
- **International migration:** requires an open-border law or event-defined exception; flows depend on wage/welfare differences, transport, and receiving-country constraints.

Migration decisions are made at aggregate scale, have explicit source and destination blocks, and conserve world population except for documented external migration. The system must be capable of reversals: do not force every industrializing country to follow a monotonic path.

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

A market is a pool of available goods, prices, and demand for a defined set of regions. In the first implementation, a country may use one market; additional markets and trade links are introduced when multi-country simulation is working. **Current M3:** one market, one region group, no imports/exports, tariffs, or external counterparty; final overflow is recorded locally.

- Markets do not create stock. Stock changes only through production, imports, purchases/consumption, exports, recorded waste, or capacity-driven loss.
- Warehouse buildings and explicitly defined infrastructure contribute storage capacity.
- Excess goods beyond physical storage capacity are not silently stored. Handle them using a documented outcome such as reduced production, recorded spoilage, or a sale; do not simply delete them.
- Regions in the same market share a pooled price in v1. Transport costs apply to exchanges between markets; fine-grained intra-market logistics are deferred.
- Dependencies/colonies share the overlord’s market in the initial model unless a scenario or law defines a separate customs zone. Transfers, tariffs, and ownership income must still be recorded separately.
- Imported goods must enter through a trade transaction and an origin market or external-rest-of-world account. Never create imports to fill shortages without accounting for their cost and counterpart.

### 7.5 Market clearing and inventories

For each market and good, track opening stock, current production, imports, desired demand, funded demand, fulfilled demand, exports, losses, and closing stock. Apply the priority tiers defined in §4.3. Allocation within a tier is proportional and deterministic. **Current M3:** imports and exports are zero and explicit; authoritative inventory is represented by seller-attributed stock lots; final storage overflow is applied after Pass B and recorded per lot/owner. The identity below remains binding for the implemented terms.

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
  building operating account and is not distributed to owners.
- Household accounts change only through settled market purchases and wage
  receipts. There is no universal income, savings interest, asset drawdown beyond
  actual cash, owner-capital injection, or unexplained transfer.
- Insolvency and low productivity are possible; the baseline does not yet implement
  borrowing, reduced production, layoffs, closure, or bankruptcy rules.

**Future requirements (preserved; not current features):**

- Wage obligations should eventually include the country/market wage index, labor
  scarcity, productivity, inflation/price conditions, and applicable labor laws.
- Losses reduce retained cash/equity and may trigger borrowing, reduced production,
  layoffs, or closure under explicit rules.
- Private profits are distributed to the owner/Capitalist household aggregate or
  retained as business funds according to a defined dividend/retention rule.
- State-owned enterprise profit is transferred to the treasury through a recorded
  transaction.
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

V1 uses SUSD as a common unit of account, with simplified cross-currency mechanics. It does not claim to reproduce every detail of national banking systems. It does require internally consistent financial flows.

The complete v1 finance subsystem must eventually support:

- Household financial assets.
- Business operating cash/assets and debt.
- Government cash, revenue, expense, debt, and interest obligations.
- Bank/central-bank accounts and monetary issuance where enabled.
- Domestic and foreign bond holders.
- A rest-of-world counterparty for external trade and financial flows.
- A double-entry posting interface with balanced transactions.

**Current M3a/M3e baseline (implemented and tested):** a minimal cash ledger with
household accounts, building operating accounts, and one system-reserve account.
`JournalPosting` lines are balanced and validated atomically; balances are
authoritative; a bounded recent posting buffer and `nextPostingId` are retained.
M3a/M3e record only the cash leg. Revenue/expense/equity recognition, period
summaries, debt contracts, government accounts, banks, central banks, foreign
holders, taxes, interest, and monetary issuance are **not implemented**. M3f
settles market purchases, wages, and upkeep against this cash ledger.

Each transaction is represented by journal lines whose total debits equal total credits. Store authoritative balances and compact daily/monthly/annual summaries. A full high-volume transaction history need not be retained for the entire century, but postings must be validated when they occur, and a bounded recent audit buffer must support debugging. The Ledger UI shows period summaries and their underlying categories.

A transaction must never make money appear without a counterpart entry. Valid sources include earned income, transfers from another account, borrowing, or explicit monetary issuance. Valid uses include purchases, taxes, interest, transfers, asset acquisition, losses, or redemption. Money-supply changes must be recorded, not inferred from a price index alone.

### 8.2 Financial accounts and debt contracts

M3a/M3e already implement the versioned cash-account, posting, and finance-state
types needed for the M3 cash ledger. M4 must **extend** that foundation rather than
introduce double-entry accounting from scratch. At minimum, M4 adds or extends:

- `FinancialAccount`: stable ID, owner/type, account category, current balance, and optional country/sector reference. *(M3 baseline: pop block, building, system reserve.)*
- `JournalPosting`: day, transaction type/source, account lines, amount, and optional entity IDs. *(M3 baseline implemented.)*
- `DebtContract`: issuer, holder sector/account, principal, annual coupon, issue date, maturity date, and priority/status. *(Future.)*
- `FinanceState`: accounts, contracts, period summaries, monetary aggregates, and audit buffer. *(M3 baseline: accounts, postings, nextPostingId only.)*

Accounts and balances are authoritative; `Treasury.cash`, money supply, and sector totals should be derived or updated from the finance subsystem through one interface, not duplicated independently across systems.

Debt holders may be domestic households/businesses, foreign investors, or the central bank. Issuing a bond transfers funds from the purchaser’s account to the issuer, creates a liability for the issuer, and creates a matching asset for the holder. Central-bank purchases require matching entries on the central-bank balance sheet and may expand the defined monetary aggregate. Refinancing is not revenue; repaid principal is not ordinary expenditure.

### 8.3 Government revenue

**Status: future system (M4 and later).** No tax, tariff, collection, or treasury
revenue flow is implemented in M3a–M3f.

Initial revenue sources:

| Source | Tax base / cause | Collection considerations |
|---|---|---|
| Land tax | Land value/rents and defined agricultural property base | Requires taxable assessment and collection efficiency. |
| Income tax | Household wage and other defined personal income above exemptions | Tax schedules may differ by stratum and law. |
| Corporate tax | Taxable business profits | Losses and deductions require explicit rules. |
| Consumption/excise tax | Eligible good transactions | Tax is collected once at the defined transaction stage. |
| Tariffs | Imports crossing a tariff boundary | Apply only to transactions legally subject to the tariff. |
| State enterprise profit | Actual state-owned enterprise profit remitted | Cannot exceed available profit/remittance. |
| Colonial/subject transfers | Defined transfers from subject administrations or regions | Record the payer, recipient, extraction/transfer rule, and political consequences. |

Collection efficiency is derived from bureaucrat staffing, literacy, funded administration, infrastructure, and institutions. A provisional formula may be used, but it must have normalized inputs, explicit units, clamps, and calibration tests. Avoid a magic `taxCapacity` variable whose own causal meaning is undefined.

Tax rates are law-bounded player controls. All taxable amounts, exemptions, and timing rules must be explicit. Tax proceeds are transferred to government accounts; they are not created ex nihilo.

### 8.4 Government expenditure

**Status: future system (M4 and later).** No government spending, procurement,
transfer, education, health, military, or debt-service flow is implemented in
M3a–M3f.

Initial categories:

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

**Status: future system (M4 and later).** No debt contract, deficit financing,
credit, interest accrual, bond maturity, or default mechanism exists in M3a–M3f.

A deficit occurs when accrued expenditure exceeds revenue over the defined period. It must be financed by an explicitly permitted source or result in arrears/default under an explicit rule.

- Domestic issuance is constrained by domestic financial assets and willingness to hold the bonds.
- Foreign issuance depends on creditworthiness, access, external conditions, and any capital controls.
- Central-bank financing creates matching balance-sheet entries and can affect monetary aggregates and inflation.
- Bond coupons accrue daily; payments and principal maturities follow contract dates.
- Debt-to-GDP, maturity structure, inflation, credibility, external position, and institutions influence borrowing terms.
- If refinancing fails, the country may face arrears, forced spending cuts, default, capital flight, or a currency crisis according to explicit event rules.

The original debt/GDP value of 1.5 is a provisional alert threshold, not a universal law. Defaults must not happen merely because a ratio crosses one fixed threshold; liquidity, maturity, holder willingness, and policy rules matter.

### 8.6 Prices, inflation, and currency regimes

**Status: future system (M4 and later).** M3 prices are nominal SUSD-equivalent
market prices from M3d. There is no country inflation index, FX regime, central
bank, money supply, or currency conversion in M3a–M3f.

All monetary balances and quoted prices are stored in nominal SUSD-equivalent terms. Each country has an inflation index and an FX/regime state. V1 models macroeconomic consequences with aggregate rules; it does not fully simulate every local-currency note and deposit denomination.

Inflation must have explicit causes, including the defined monetary aggregate, output growth, expectations, supply shocks, wage/input pressures, exchange-rate pass-through, and administered prices where appropriate. The exact combination is provisional and must be documented and calibrated. Do not update inflation solely because prices were already raised by the price system, which would double-count the same shock.

Historical starting assumptions for the baseline scenario may include:

- Gold-standard regimes in some states during 1900–1914, with country-specific departures and return-to-gold events where appropriate.
- Interwar monetary changes and crises, including but not limited to gold-standard periods.
- Bretton Woods arrangements after 1944 for participating economies, ending as the system breaks down around 1971.
- Floating or managed exchange-rate regimes in later decades.

Do not force every country into the same regime on the same day. Regime membership, pegs, capital controls, reserves, and changes must be defined by country data, laws, or historical events.

### 8.7 Finance invariants

**Current M3:** every posted journal batch is balanced and validated before
mutation; no market batch may create a negative buyer balance; wage/upkeep
shortfalls are partial and never create debt; total cash is conserved; the
system-reserve account receives upkeep. The following debt, tax, interest, and
monetary invariants are future requirements.

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

### 12.1 Deterministic decision model

Country AI is rule-based and evaluated every seven days, staggered by stable country ID. Its output is a list of proposed actions; the simulation validates legality, affordability, prerequisites, and timing before applying them.

Initial goal priority for the economic/political AI:

1. Avoid immediate insolvency or essential-service collapse.
2. Respond to severe unmet needs and destabilizing unrest.
3. Remove critical production bottlenecks.
4. Improve labor productivity, education, and infrastructure.
5. Industrialize when feasible and economically justified.
6. Maintain required security and military commitments once military systems exist.
7. Pursue expansion or diplomatic goals only when those systems and conditions are available.

Priority may be adjusted by regime, laws, security conditions, institutions, and scenario. The list is not a script that every country must follow in every circumstance.

### 12.2 AI information and reproducibility

- An AI may use information available to the country it governs and public information defined as visible to players.
- It must not use hidden information or future events not available to a comparable player.
- It uses the same action validation rules as the player.
- Its decisions must be deterministic for a given state, seed, and evaluation day.
- Any stochastic choice must use keyed deterministic randomness with an explicit purpose identifier.
- Avoid AI re-planning that emits contradictory actions every tick. Goals persist until completion, invalidation, or a documented re-evaluation rule.

### 12.3 Initial action set

For M6, actions may include setting tax/spending policy, queuing a building, adjusting permitted laws once laws exist, and prioritizing infrastructure or production. Military and diplomatic actions are added only after their systems are implemented.

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
- Save size: target under 4 MB for the initial full-scale world; revise only after measuring real state.
- Sustained 10 days/second: battery drain target no more than twice measured idle drain under a controlled test.

Record device model, OS, build type, world size, warm-up, test duration, p50/p95/p99 tick times, snapshot rate, memory, and battery conditions. A Node benchmark is a fast regression test, not proof of mobile performance. Validate performance on-device in a release build. Current M2.1/M3f Node benchmarks do **not** evaluate or pass the mobile p95 target; its status remains **NOT EVALUATED**.

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
- Test save/load mid-month, mid-year, after an event, after random draws, and at the terminal boundary.

### 14.7 History and diagnostics

Persist annual samples only for long-range charts; avoid per-day history buffers for all fields. Maintain monthly summaries for finance and any detail needed by the Ledger UI. Keep a bounded recent event/transaction audit ring for debugging. Expose optional debug counters for conservation errors, invalid states, allocation failures, and performance metrics.

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
4. **Population conservation:** world population changes only through births, deaths, and explicitly recorded external migration; annual ageing and profession changes conserve people.
5. **Employment conservation:** no worker is assigned to more than one job; assignment never exceeds available workforce or job slots.
6. **Goods conservation:** market inventory reconciles with opening stock, production, imports, use, exports, and recorded losses.
7. **Money/accounting conservation:** each posting balances; transfers have counterpart accounts; money supply changes only through defined mechanisms.
8. **No-arbitrary-pools check:** known point pools are forbidden; derived indicators must be rebuildable or explicitly documented.
9. **Market behavior:** prices respond in the correct direction to persistent supply/demand shocks, remain finite/positive, and are bounded per tick.
10. **Finance behavior:** debt issuance, interest, maturity, taxes, transfers, and default reconcile on controlled test fixtures.
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

Accrued but unpaid items must be separately represented. Borrowing is financing, not revenue.

**Financial postings:**

For each posted transaction, total debits equal total credits. Changes in assets, liabilities, income, and expense follow the defined account rules.

### 16.5 Benchmark fixtures

Provide at least three fixtures:

- **Minimal:** one country, one market, one region, a few pop blocks and buildings.
- **Representative:** eight authored polities and the initial target scale of regions/pop blocks.
- **Stress:** full target scale, maximum permitted pop blocks, active markets, dense employment assignment, and ongoing AI evaluations.

Benchmarks must state the exact seed, data version, tick count, hardware/runtime, and measurement procedure. Performance targets are not allowed to be “verified” on a different test scale without stating the difference.

---

## 17. Build order and milestone acceptance criteria

Each milestone is a separate assigned task. Tests and acceptance criteria are prepared before implementation. Do not start the next milestone until the current one is complete or the designer explicitly accepts a documented exception.

| Milestone | Deliverable | Definition of done |
|---|---|---|
| **M0** | Monorepo scaffold, TypeScript configuration, tests, benchmark harness, pnpm CI command | Repository installs reproducibly; `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run bench`, and `pnpm run ci` execute. No simulation behavior yet. |
| **M1** | Simulation core: world schema, calendar, keyed randomness, serializer, save versioning, empty-world no-op tick path | Calendar tests pass; exactly 36,524 processed campaign ticks reach the 2000-01-01 terminal boundary, whose tick is a no-op (there are 36,525 valid day indices including that boundary); repeat and save/resume hashes match; typed-array round-trip is verified. |
| **M2** | Population blocks, single-year sex-separated age state, age-specific fertility/mortality, needs baskets, wealth index in a single-region fixture | Single-year/sex population conservation passes; five-year bands reconcile as derived aggregates; births enter age 0 with documented sex split; deterministic fractional accumulation passes; no negative counts; unmet needs change the specified outcomes. Needs use the M2 annual-disposable-income fixture without savings drawdown or account mutation. Historical total calibration is reported separately and is not required for structural M2 completion. |
| **M2.1** | Population correction and demographic validation: authoritative single-year/sex state, exact annual ageing, ASFR fertility, sex-specific mortality, annual WPP 1950–2000 schedules, WPP-1950 validation scenario | Structural correctness, conservation, save/resume, and deterministic regression tests pass; annual age/sex and total validation against WPP is reported with absolute/relative differences. Post-1950 WPP validation is source-backed; 1900–1949 age structure/schedules remain provisional. The campaign's +9.553% 2000 difference is documented as a no-shock baseline limitation, not historical calibration success. Full pre-1950 historical calibration remains incomplete. |
| **M3** | Buildings, employment assignments, goods, production, market clearing, inventory, price updates, wages/profits, and an integrated economic tick in a small economy | Goods conservation passes; price-shock tests behave correctly; scarce-goods allocation is order-independent; no NaN/infinity; insolvent or unproductive buildings can fail without creating value. The accepted M3 baseline is delivered through stages M3a–M3f below. |
| **M4** | Full finance/public-finance extension: taxes, government expenditure, debt contracts, interest/maturity, inflation/FX indices | All postings balance; cash/debt/interest/maturity tests reconcile; no money appears without a defined source; controlled deficit and default cases behave as specified. M4 extends the M3a/M3e cash-account and posting foundation; it does not introduce the first accounting interface from scratch. |
| **M5** | Multi-region/multi-country worlds, shared/trade markets, migration, labor mobility, initial historical data pipeline | Eight authored sample polities run together; data validator passes; population, goods, and finance invariants pass; occupation structure trends meet country-specific baseline ranges where data supports them. |
| **M6** | Deterministic country AI v1, action validation, stress testing, simulation performance report | AI can govern the sample world without invalid actions or hidden-information access; full-campaign benchmark reports p50/p95/p99; no unbounded state growth; performance bottlenecks are identified. |
| **M7** | Mobile worker proof of concept and playable app: map, snapshot bus, five core screens plus map | Release build runs on iOS and Android; pause/speed/actions/save/load work; UI reads snapshots only; target frame-rate and on-device tick performance are measured and reported. |
| **M8** | Institutions, interest groups, laws, elections, unrest, instability, historical-shock/event content | Law/election outcomes follow documented prerequisites; a revolution or regime crisis can arise from simulated causes; scripted events are idempotent and have provenance. |
| **M9** | Technology tree, research staffing/work, education and literacy mechanics | Acyclic tree validates; tech progress occurs only from assigned work; unlocking technology measurably and correctly changes the specified systems; literacy outcomes match the test scenarios. |
| **M10** | Diplomacy, treaties, armies, mobilization, combat, casualties, occupation, peace | Two-country conflict resolves end-to-end; casualties and mobilization reconcile with population/workforce; equipment and finance are consumed correctly; peace/territorial changes update all affected systems. |

**Vertical slice:** M0–M7. The slice is complete only when the player can start a scenario, inspect the country/world, change available economic policies, advance/pause time, save/load, and observe deterministic, causally connected consequences on a device.

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
D-042. It does not implement a trailing-month income accumulator. M4 is a separate
milestone and has not started.

M8–M10 extend the systems after the economic vertical slice is playable. Their interfaces may be prepared earlier, but do not implement speculative behavior in the vertical-slice milestones.

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
4. **Accounting unit:** SUSD is the shared unit of account for v1; currency regime/FX effects are aggregate and simplified.
5. **Accounting integrity:** financial flows use balanced double-entry postings; long-term history is compacted into period summaries.
6. **Randomness:** keyed/counter-based deterministic random draws, not one shared mutable PRNG stream.
7. **Daily ordering:** the pipeline in §4.2 is binding unless changed with tests and a decision record. In particular, M3d market clearing includes bounded price adjustment before M3e settlement; settlement uses established transaction prices (D-043). Moving price adjustment after settlement requires a new decision and regression tests.
8. **Dependency markets:** dependencies initially share the overlord’s market unless data, event, or policy specifies another customs zone; transfers remain separate recorded flows.
9. **Wealth level:** a cached/smoothed index per pop block, not money and not an independently spendable resource. Monthly update uses the provisional income convention in §6.5; an exact trailing-month average is not implemented.
10. **Buildings:** physical instances are located in regions and owned by private or state accounts. Current M3 baseline instances are private only.
11. **Historical calibration:** target values are provisional until metric definition, date convention, and source provenance are complete. Post-1950 WPP validation is source-backed; 1900–1949 population composition and schedules remain provisional; the 1900 campaign is not a historical-validation success.
12. **Performance:** Node benchmarking is diagnostic; mobile performance is unverified and must be confirmed on a named reference device in a release build. No mobile target has passed. The mobile p95 target is **NOT EVALUATED**.
13. **M2-only finance fixture:** on the M2-only path, needs are funded from annual disposable income only, with no savings drawdown and no account mutation. M3f economic worlds instead use opening household cash and actual settlement; the full intended model remains household financial assets plus settled income less mandatory payments.
14. **Economic-day atomicity:** for worlds with buildings or markets, the complete day is staged on a structural clone and published only after all phases and final validation succeed. The M2-only path is separate.
15. **Catalog scope:** the current M3 data subset is eight goods and eight building types; the fifteen-good/thirteen-building v1 target remains design intent, not current completeness.

### 20.2 Remaining designer decisions

These are intentionally left open because they depend on desired gameplay depth rather than technical correctness. Use the stated default until the designer chooses otherwise:

1. **Campaign victory/end state:** default is a sandbox with a historical end-of-century report, not a mandatory victory condition.
2. **Player country selection:** default is any fully authored sovereign polity in the selected scenario; incomplete stubs are not playable until validated.
3. **Ironman/reload restrictions:** default is unrestricted save/load, with no Ironman mode in v1.
4. **Historical deviations:** default is a baseline event set that allows outcomes to diverge; no forced “railroad” restoration after an alternate outcome unless an event explicitly requires it.
5. **Monetary depth beyond v1:** default is the aggregate SUSD-accounting model in §8; detailed local denominations and banking instruments are deferred.
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

**Initial task:** for a new project, start with M0 and M1 only, using §§3–5, §§14, 16–18 as binding references. The first deliverable is a tested simulation foundation, not the economy or UI. For the current repository, **M0/M1/M2/M2.1/M3a–M3f** are the accepted baseline; the next milestone must be assigned explicitly from §17 and must not be inferred from this document alone. M4 is not started and must not be inferred.

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
- **SUSD:** simulated USD, the common monetary unit of account used in v1.
- **Technology project work:** cumulative record of research labor applied to one specific technology.
- **Tick:** one simulation update for one civil day.
- **Trailing-month income average:** a monthly average of household income over the preceding civil month. M3f does **not** implement this; its monthly wealth convention annualizes one day's actual settled wages.
- **Current implementation:** the behavior actually delivered and tested by the accepted M0–M3f baseline, as distinct from provisional rules and future requirements.
- **Whole-day staging:** running all phases of an economic day on a structural clone and publishing it only after every phase and final validation succeeds.
- **Vertical slice:** the smallest playable end-to-end version that proves the complete product path rather than only isolated systems.

---

**End of document.**
