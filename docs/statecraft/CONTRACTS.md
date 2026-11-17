# Statecraft Program — shared contracts

Every stage builds against the same shapes, so that systems written months apart fit together.
The TypeScript below is a **sketch of the shape, not final code**. The stage that first implements
a contract fixes its names and details, records them in its completion report and corrects this
file. Later stages then follow this file exactly. If a later stage needs to change a contract, it
asks the designer first.

| § | Contract | Lives in | First implemented by |
|---|---|---|---|
| 1 | Scheduler: wheels, slots, jobs | `packages/sim` | S2a |
| 2 | Cohorts | `packages/sim` | S2b |
| 3 | Views | `packages/sim-worker` | S2c |
| 4 | Indicators and attribution | `packages/sim` (values, explain), `sim-worker` (delivery) | S5 (ids and units from S2c) |
| 5 | Actions and forecasts | `packages/sim` | S5 |
| 6 | Decision journal | `packages/sim-worker` (campaign record) | S5 |
| 7 | Desk cards | `packages/sim` (rules, state), `app` (render) | S4 |
| 8 | World events | `packages/sim` (emit, log), `sim-worker` (rank, text) | S6 |
| 9 | AI proposals and reasons | `packages/sim` | S8 |
| 10 | People (characters) | `packages/sim` | S14 |
| 11 | Timeline | `packages/sim-worker` (derived) | S4 |
| 12 | Lenses | `sim-worker` (values), `app` (drawing) | S4 |
| 13 | Strings | `packages/app` | S4 |
| 14 | State, ids and saves | `packages/sim` | exists; rules restated |

---

## 1. Scheduler

### 1.1 Wheels and slots

```ts
type Wheel = "day" | "week" | "month" | "year";

interface WheelJob {
  readonly id: string;                 // stable, e.g. "market.round", "demography.month"
  readonly wheel: Wheel;
  readonly unit: "world" | "territory" | "country" | "province";
  readonly order: number;              // fixed position in the day's pipeline
  run(world: World, context: TickContext, entityIds: readonly Id[], period: Period): void;
}

interface Period { readonly fromDay: Day; readonly toDay: Day }  // toDay exclusive; toDay = today + 1
```

Which entities run on a given day:

| Wheel | Slot of a day | Entity's slot comes from |
|---|---|---|
| day | every day | — |
| week | `dayIndex mod 7` (day 0 is Monday 1 January 1900) | `schedule.marketDay[territory]`, 0 to 6 |
| month | day of month − 1, for days 1 to 28. Days 29 to 31 run no entity slot. The month's accounting close runs on the last civil day | `schedule.monthSlot[province]` or `[territory]`, 0 to 27 |
| year | `min(51, floor((dayOfYear − 1) / 7))` | `schedule.yearSlot[country]`, 0 to 51 |

### 1.2 The schedule is data

- `World.schedule` holds the slots. It is part of the save and the hash.
- For the 1900 scenario the slots are authored by a generator script from costs measured offline
  in `packages/bench`, written to a committed data file with a `--check` mode. The largest
  territories get different market days.
- An entity created during play (a new polity, a new territory) takes `id mod slots`.
- **Never** compute a slot from a time measurement at run time, and never read a clock in
  `packages/sim`.

### 1.3 The elapsed-days rule

Each job records per entity the day it last ran (`lastRunDay`, authoritative state). A run covers
exactly the civil days in `[lastRunDay, today]`. The first run covers the days since the scenario
start.

- Constants keep their units (per day, per year). The job multiplies by the days elapsed. A rate
  per year uses the actual length of each civil year the period touches. Do not create "weekly"
  constants.
- A flow for the period is `rate × days`. A compounding process (growth, decay, depreciation)
  uses `(1 + r)^days − 1` or its exact equivalent, not `r × days`.
- Fractional people keep their deterministic remainder accumulators across runs.
- A test runs a job at two cadences (seven daily runs against one weekly run) on a fixture and
  shows the totals agree within a stated tolerance.

### 1.4 Smoothing and bounded steps

- Exponential smoothing over `Δ` days with time constant `τ` days:
  `s += (x − s) × (1 − exp(−Δ / τ))`. With `Δ = 1` this is the daily rule to first order.
- A bound stated per day (the price step of 5 % a day) becomes, over `Δ` days,
  `|Δ ln P| ≤ Δ × ln(1 + dailyBound)`.

### 1.5 Order and isolation

- One fixed pipeline per day: day jobs (events, actions, AI slice, war) → week jobs → month jobs →
  year jobs → daily invariants → views. The registry lists it; nothing else decides order.
- Inside a job, entities are processed in id order (`inIdOrder`).
- A job reads other entities' state as it stood when the day began: posted prices, stocks,
  shipments with their arrival day. Two territories with the same market day must give the same
  result whichever is processed first; a test swaps them.
- Every job conserves people, goods and money on its own. The cheap daily invariants (total
  people, designated cash, inventory identity) run every day.

### 1.6 Actions and timing

A validated action changes state at once. If its effect is realised by a wheel job, the action's
result names the day ("takes effect on the next market day, Tuesday 9 March"), and the interface
shows it.

### 1.7 Budget

`packages/bench` times each job through the existing `observe` hook (see
`packages/bench/src/perfPhases.ts`). It
prints the **load map** (job × calendar day for one year) and fails when any day exceeds 200 ms or
a job exceeds its line in program §4.5 on the reference desktop.

---

## 2. Cohorts

```ts
interface CohortKey {
  readonly territoryId: Id;
  readonly incomeBin: number;                 // index into the bin edges in constants
  readonly settlement: "urban" | "rural";
}
```

- **Why it is exact.** In the linear expenditure system, demand for good *i* is
  `q_i = N·γ_i + (β_i / p_i) × (Y − N × Σ p_j·γ_j)`, with `N` adult equivalents and `Y` spendable
  money. It is linear in `N` and `Y`. Blocks that share prices `p` and parameters `γ, β` can be
  summed first: the cohort's demand computed on totals equals the sum of its blocks' demands.
- **Bins.** The marginal shares `β` depend on income. Blocks are grouped by smoothed real income
  per adult equivalent into bins with authored edges; a cohort uses the parameters at its own mean
  income. A block's bin is recomputed on its month slot, not every round.
- **Apportioning back.** Committed purchases go to blocks in proportion to adult equivalents;
  marginal purchases in proportion to each block's spendable money above its committed cost.
  Money is split exactly: the rounding residual goes to the block with the largest share, ties by
  lowest id.
- **Shortage.** The cohort is rationed by the existing tier rule; inside a cohort, pro rata.
- **Own consumption** of peasants in kind is settled per block before cohorts are formed; it is
  not market demand.
- **Tests.** (a) Within one bin, cohort clearing equals per-block clearing to 1e-9 relative.
  (b) On the 1900 world, the error introduced by binning is reported per good family and stays
  under the tolerance agreed in the S2b plan. (c) Money and goods are conserved exactly through
  apportionment.

---

## 3. Views

```ts
interface ViewDef<Params, Payload> {
  readonly id: string;                       // "hud", "desk", "place.province", "lens.bread-price"
  readonly cadence: "day" | "market-day" | "month" | "on-change";
  readonly indicators: Readonly<Record<string, string>>;  // payload field path -> indicator id
  build(world: World, definitions: Definitions, params: Params): Payload;  // pure; reads only
}
```

- **Protocol.** `subscribe { subscriptionId, viewId, params }`, `unsubscribe { subscriptionId }`;
  event `view { subscriptionId, version, payload }`. The worker rebuilds a subscribed view only
  when its cadence is due or an action touched its inputs. There is no "whole world" message.
- **Size.** A view payload stays under 64 KB, a lens under 16 KB (one `Float32Array` of province
  values). Typed arrays are copied to the interface, never transferred (D-163).
- **Every numeric field maps to an indicator** through `indicators`. An audit test fails when a
  numeric field has no indicator. This is what makes "why" available everywhere.
- **The app holds no simulation logic.** If the interface needs a derived figure, it is a field of
  a view.
- Cost: the views of one day together stay within 15 ms (program §4.5).

---

## 4. Indicators and attribution

```ts
interface IndicatorDef {
  readonly id: string;                        // "price.good", "country.unemployment"
  readonly unit: string;                      // "RUSD", "RUSD/year", "people", "share", "index", "kg"
  readonly kind: "stock" | "flow" | "ratio" | "index";
  readonly period: "now" | "week" | "month" | "year";
  readonly entity: "world" | "country" | "territory" | "province" | "group" | "good";
  readonly codexKey: string;
  value(world: World, entity: EntityRef): number;
  explain(world: World, entity: EntityRef): readonly Contribution[];   // on demand only
}

interface Contribution {
  readonly cause: string;                     // string key, e.g. "cause.rail-access"
  readonly amount: number;                    // signed, in the indicator's unit (or a factor for ratios)
  readonly share: number;                     // 0..1 of the explained total
  readonly drill?: { readonly indicator: string; readonly entity: EntityRef };
  readonly levers?: readonly string[];        // action kinds that move this cause
}
```

Rules for `explain`:

1. **A sum** (a flow, a stock): the contributions are its parts and add up to the value. Give the
   five largest and "other".
2. **A product** (`level = base × f1 × f2 × …`): one contribution per factor, `amount` = the factor
   (for example 1.12), `share = |ln f_i| / Σ |ln f_j|`.
3. **A change** over the indicator's period: the change of each part, or the log change of each
   factor, by rule 1 or 2.
4. `explain` runs only when asked. It must not be called from a wheel job.
5. A cause that the player can influence lists its `levers`. A cause that is itself an indicator
   gives a `drill`, so the player can keep asking "why".
6. The same `value` functions are the AI's eyes (§9) and the base of forecasts (§5). Do not write
   a second calculation of the same figure anywhere.

---

## 5. Actions and forecasts

```ts
interface ActionDef<A extends CountryAction> {
  readonly kind: A["kind"];
  validate(world: World, action: A): Rejection | null;      // never mutates
  apply(world: World, action: A): void;                      // only after validate
  firstOrder(world: World, action: A): readonly EffectEstimate[];   // instant, analytic, no mutation
  takesEffect(world: World, action: A): { readonly day: Day; readonly noteKey: string };
  readonly affects: readonly string[];                       // indicator ids
  readonly ministries: readonly Ministry[];                  // AI ministries that may propose it
}

interface EffectEstimate {
  readonly indicator: string;
  readonly entity: EntityRef;
  readonly delta: number;                    // expected change in the indicator's unit
  readonly low: number;
  readonly high: number;
  readonly horizonDays: number;
  readonly holdsFixed: readonly string[];    // string keys: what the estimate assumes unchanged
}
```

- `validate` and `apply` exist today in `packages/sim/src/economy/ai.ts`
  (`validateCountryAction`, `applyCountryAction`). The contract adds `firstOrder`, `takesEffect`,
  `affects` and `ministries` per action kind and moves each kind into its own module.
- **An action is unfinished** until `firstOrder` returns at least one estimate and `ministries`
  is not empty. A test enforces both.
- `firstOrder` is the direct, same-period arithmetic of the change (a tariff of 10 % on imports of
  X at current quantities raises Y of revenue and Z on the landed price). It states what it holds
  fixed. It is not a guess at the long run.
- **Projection** ("Ask the model"): command `project { variant: actions, horizonDays, territoryId }`.
  The worker copies the world, freezes every other territory at its current prices and policies
  and every AI, and runs the territory's own jobs forward twice (with and without the actions).
  Events `projection-progress` and `projection-result { series per indicator }`. It runs only
  while the game is paused, is cancelled by unpause, and is cached by world hash and action hash.
  Its result is labelled with what was frozen.

---

## 6. Decision journal

```ts
interface JournalEntry {
  readonly id: number;
  readonly day: Day;
  readonly titleKey: string;
  readonly actions: readonly CountryAction[];
  readonly forecast: readonly EffectEstimate[];
  readonly checkpoints: readonly {
    readonly day: Day;                                   // decision day + 90, 365, 1,095
    readonly actual: readonly { readonly indicator: string; readonly entity: EntityRef; readonly value: number }[];
    readonly gap: readonly Contribution[];               // why the outcome differs from the forecast
  }[];
}
```

The journal is the player's record, not simulation state. It is saved in the worker's campaign
record next to the world, outside the world hash, and it never feeds back into the simulation.

---

## 7. Desk cards

```ts
type Ministry = "finance" | "economy" | "interior" | "education" | "foreign" | "war";

interface DeskCard {
  readonly id: number;
  readonly kind: "decision" | "crisis" | "report";
  readonly rule: string;                       // the card rule that raised it; also the dedupe key
  readonly ministry: Ministry;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly facts: Readonly<Record<string, number | Id>>;
  readonly why: readonly { readonly indicator: string; readonly entity: EntityRef }[];
  readonly raisedDay: Day;
  readonly deadlineDay: Day | null;
  readonly options: readonly DeskOption[];     // empty for a report
  readonly onExpiry: number | "dismiss";       // index of the option applied at the deadline
  readonly importance: 1 | 2 | 3;              // 3 pauses the game
}

interface DeskOption {
  readonly labelKey: string;
  readonly actions: readonly CountryAction[];  // applied through the normal validator
  readonly forecast: readonly EffectEstimate[];
}
```

- **Card rules live in the simulation.** A card rule is a pure function from the world and a
  country to "a situation that needs a decision". For an AI country the same rule wakes the
  ministry that owns it (§9). For the player's country it becomes a card. One set of rules, two
  consumers.
- **Card state is authoritative** (open, deferred, answered), because an expired card applies its
  default option. It is saved and hashed.
- A decision card has at least two options with different trade-offs. "Do nothing" is an option
  with its own forecast when doing nothing is possible.
- Limits: at most twelve open cards; at most one open card per `rule` and subject; importance 3 is
  reserved for crises and deadlines inside seven days.
- A card cites its figures in `why`. A card that cannot say why it was raised is not raised.
- If a situation has one sensible answer, it is not a card. Offer the player a standing rule
  instead ("keep the reserve above three months of spending").

---

## 8. World events

```ts
interface WorldEvent {
  readonly id: number;
  readonly day: Day;
  readonly type: string;                       // key in the event-type registry
  readonly actors: readonly Id[];              // country ids, most involved first
  readonly provinceId: Id | null;
  readonly magnitude: number;                  // 0..100, scale below
  readonly facts: Readonly<Record<string, number | Id | string>>;
}
```

- The system that changes the state emits the event at the moment of the change. Nothing else
  creates events. The log is authoritative, deterministic and bounded: the latest 2,000 events,
  plus every event of magnitude 60 or more for the whole campaign.
- **Magnitude scale** (each event type documents its formula against these anchors): 10 a local
  matter (a strike in one town); 30 routine national news (a law passed); 50 major national news
  (a government falls); 70 an international event (a war between two states, a great-power
  crisis); 90 world-historic (a general war, a revolution in a great power).
- Text is built in the worker from templates keyed by `type`, using only `facts`. No sentence is
  assembled from fragments, and no text is written in the simulation.
- **Ranking for the player** (worker): `score = magnitude × relevance × novelty`. Relevance: own
  country 1.0; neighbour, ally, rival, one of the five largest trade partners, creditor or debtor
  0.6; any great power 0.4; otherwise 0.15. Novelty falls for repeats of one type and actor inside
  30 days; repeats are merged into one story ("Third strike this month in Silesia").

---

## 9. AI proposals and reasons

```ts
interface Proposal {
  readonly ministry: Ministry;
  readonly actions: readonly CountryAction[];
  readonly value: {                             // expected change, each on a documented −1..1 scale
    readonly security: number; readonly growth: number; readonly welfare: number;
    readonly prestige: number; readonly ideology: number;
  };
  readonly cost: { readonly moneyRUSDPerYear: number; readonly consentMissing: number };
  readonly reasons: readonly Reason[];
  readonly planId: number | null;               // a multi-year plan this proposal continues
}

interface Reason {
  readonly code: string;                        // string key, e.g. "reason.protect-coalition"
  readonly weight: number;
  readonly facts: Readonly<Record<string, number | Id>>;
}
```

- The AI **observes** its own country in full and other countries only through public facts and
  what its embassies and intelligence report (from S16). Before S16, "public facts" are the
  indicators any player can see for a foreign country.
- Values come from `firstOrder` (§5) and indicator values (§4). The AI has no private formulas for
  figures the player also sees.
- Every applied proposal stores its reasons in a bounded per-country log. Views, diplomatic
  answers and the Gazette read them. An AI action without a reason is a bug.
- A plan persists until it completes or a strategic review cancels it with a reason. The arbiter
  does not reverse a decision inside the plan's minimum duration.
- Each country thinks on its own day of the week (`schedule.aiDay`), as today.
- Difficulty changes the horizon and the error of the AI's estimates. It never changes rules,
  costs or information for anyone.

---

## 10. People (characters)

```ts
interface Person {
  readonly id: number;
  readonly countryId: Id;
  readonly name: string;                       // generated from the heritage's name table
  readonly heritageId: Id;
  readonly faithId: Id;
  readonly birthYear: number;
  readonly role: string;                       // "head-of-state", "minister.finance", "general", …
  readonly affiliationId: Id | null;           // party or faction
  readonly competence: number;                 // 0..1
  readonly loyalty: number;                    // 0..1, to the government of the day
  readonly traits: readonly string[];          // at most three keys
}
```

At most 40 per great power and 12 per small state. A person stands for the block they come from
and is not an extra person in the population. They die by the mortality of their age (one keyed
draw a year), retire, resign or are dismissed. Competence changes outcomes only through documented
formulas of the institution they head.

---

## 11. Timeline

Derived in the worker, never stored: `{ day, kind, ref, certainty }` built from state that already
carries dates or rates: construction completion, law enactment, elections, treaty expiry, crisis
and card deadlines, the harvest. An estimate (a completion that depends on supply) is marked as
such and shown as a range.

---

## 12. Lenses

```ts
interface LensDef {
  readonly id: string;                         // "lens.bread-price"
  readonly domain: "government" | "economy" | "people" | "world" | "war";
  readonly indicator: string;                  // per province (and per country when zoomed out)
  readonly scale: "sequential" | "diverging" | "categorical";
  readonly legendKey: string;
  reading(stats: LensStats): { readonly key: string; readonly facts: Record<string, number | Id> };
}
```

A lens is one indicator drawn on the map with a legend and a **reading**: one sentence chosen by
rule from the distribution (highest and lowest places, and the leading cause of the highest from
`explain`). Colours come from the tokens; diverging and sequential scales must stay readable for
colour-blind players.

---

## 13. Strings

All player-facing text is in string tables in `packages/app` (one file per locale, English
first), addressed by key, with named variables (`{country}`, `{amount}`). Numbers, money and dates
are formatted by the format modules (`packages/app/src/format`), money always through
`format/money.ts`. Never join sentence fragments. The simulation and the worker send keys and
facts, not text.

---

## 14. State, ids and saves (existing rules, restated)

- New authoritative state belongs to `World`, with canonical serialization, validation and
  hashing, and a save round-trip test.
- Anything held per block, province, building or account is a typed column indexed by numeric id.
- Ids are positive integers, never reused. Iterate in id order.
- A cache is rebuilt on load, never saved, and safe to throw away.
- Validation rejects NaN, infinity, unknown ids and impossible states at every boundary: data
  load, action, save load.
