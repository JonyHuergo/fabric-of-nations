# Act II — The game (S4 to S8)

After this act the build is a game for the first time: the player is asked for decisions,
understands them, sees a world that acts and has something to aim for. It uses only the systems
that exist after Act I (economy, laws, construction, trade, money, schooling, the M10 war stub).

**The frame built here is permanent.** Every later stage plugs its Desk cards, lenses, Gazette
events, indicators and AI behaviour into it. Build the frame general and the content small.

Order: S4 → S5 and S6 (either order) → S7 → S8. S8 can start once S5's `firstOrder` exists.

Read first: `HANDBOOK.md`, `CONTRACTS.md` §3 to §13, program §2 and §11 to §13.

**Where the app is today.** Shell: `packages/app/src/screens/GameShell.tsx`. Thirteen screens in
`packages/app/src/screens/`. Tokens: `packages/app/src/design/tokens.ts`. Shared components:
`components/ui.tsx`, `components/Slider.tsx`. Map modes and lenses: `map/mapModes.ts`,
`map/lenses.ts`. Worker client: `worker/SimulationProvider.tsx`. Worker side:
`packages/sim-worker/src/` (`host.ts`, `explanations.ts`, `reports.ts`, the `*Preview.ts` files).
After changing tokens or anything in `packages/app/src/map`, run `pnpm map:atlas`.

---

## S4 — The shell: HUD, Desk, Timeline, domains, lenses

**Goal.** The player opens the game and is shown what needs a decision, what is coming and where
to look, on a phone, with thumbs.

### The frame at 844 × 390 (landscape; larger screens get the same layout with more room)

| Zone | Content | Rules |
|---|---|---|
| Left rail | Country badge; five domain buttons (Government, Economy, People, World, War); lens button | 44-point targets; left thumb |
| Top centre | HUD: date, four vital signs, the ticker line under it | Vital signs depend on the situation (peace: treasury trend, living standard, stability, mandate; war: front, manpower, supply, war support). Each is a figure with "why" |
| Right edge | Desk tab with a count; opens the Desk as the right sheet | Right thumb |
| Bottom right | Time: pause, a day a second, a week a second, fast, "to the next decision" | Exists in part |
| Bottom strip | Timeline: collapsed to a thin strip of markers; expands on tap | Dragging a marker offers "advance to here" |
| Right sheet | One at a time: a domain, the Desk, or a place sheet. The map stays visible beside it | No sheet over a sheet; a second level is a pushed page with a back control |

**Stop for approval** with screenshots of the frame at 844 × 390, 667 × 375 and 1180 × 820 before
porting the screens.

### Domains and tabs (at most four tabs each)

| Domain | Tabs | Takes over today's screens |
|---|---|---|
| Government | Cabinet · Laws · Budget · Accounts | Politics, Budget, Ledger, Country |
| Economy | Markets · Industry · Trade · Money | Markets, Industry, Construction, Trade, Money |
| People | Population · Work · Schools and science | Population, Labor, Technology |
| World | Gazette · Powers | (new; diplomacy joins in S16) |
| War | Forces · Fronts | War |

Opening a domain sets the map to that domain's default lens. Every action that can be issued
today must still be reachable; a playtest script checks each action kind.

### One grammar, one component kit

Every figure on every screen is shown the same way: **State → Trend → Why → Levers → Track**.
Build a small kit from the tokens and use nothing else in the ported screens: `Figure` (value,
unit, period), `Trend` (against last year), `WhyButton`, `LeverList`, `ForecastChip`, `Card`,
`Row` (a primary figure with a disclosure, never a wide table). Until S5 the `WhyButton` opens the
existing explanation where one exists and is hidden where none does.

### The Desk (`CONTRACTS.md` §7)

Card rules live in the simulation and card state is saved. Write a starter set of about twelve
rules for the systems that exist, each with at least two options built from existing actions, with
the existing previews as their forecast:

reserve below target or deficit · debt maturing soon · a need unmet in a province · a law ready
for decision · construction stalled for lack of a material · unrest high in a province · pressure
on the currency · a trade partner changed its tariff · research finished · idle surplus in the
treasury · an election approaching · the monthly report (a report card).

### Timeline (`CONTRACTS.md` §11)

Derived from dated state that exists: construction completions, law enactment days, elections,
debt maturities, research completion estimates, truce expiries, card deadlines, the harvest.

### Time

"To the next decision" runs until a card of importance 2 or more is raised, an auto-pause rule of
the player fires, or a monthly report arrives. Auto-pause rules are settings. With weekly market
rounds, "a week a second" is the default peacetime speed.

### Lenses and the place sheet (`CONTRACTS.md` §12)

Turn the existing map modes into lens definitions with a legend and a reading. Add, from existing
data: cost of bread, unemployment, living standard, population density, literacy, unrest. The
place sheet shows the province or country in the active lens's terms: the figure, its "why", up to
five related rows, and what can be done there.

### Strings

Move every literal of the screens you touch into string tables (`CONTRACTS.md` §13).

### Acceptance

- At 844 × 390: every control at least 44 points; nothing depends on hover; the Desk, the Timeline
  and the domains reachable with thumbs; the playtest script issues every action kind through the
  new frame.
- A new campaign as a great power raises at least three decision cards in its first three months,
  each with two or more options and a default.
- "To the next decision" stops for the right reasons (test).
- Tokens only; `pnpm map:atlas:check` passes; web, iOS and Android exports succeed.
- The playtest log records decisions per minute and the longest idle stretch (handbook §8).

### Traps

Rebuilding or restyling the map. A second navigation scheme next to the domains. Tables wider
than the sheet. A wall of text on a card. Cards for routine events. More than four tabs. A layout
that only works at one size. Card state kept in the app.

---

## S5 — The legibility engine: why, forecast, journal, codex

**Goal.** Every figure answers "why?"; every action shows what it will do; the game later reports
what it did.

### Build, in this order

1. **Indicators with `explain`** (`CONTRACTS.md` §4). Start from the ids declared in S2c and
   `packages/sim-worker/src/explanations.ts`. Implement `explain` first for the figures a player meets most:
   the treasury's change, revenue by source, a good's price, the cost of living, the real wage,
   unemployment, output of a good, an unmet need, living standard, birth and death rates,
   literacy, unrest, the exchange rate, debt service, construction progress. Then the rest.
2. **One calculation, two readers.** For every formula that an indicator explains, refactor the
   model so the factors are computed by one function that both the model and `explain` call. Never
   write the formula a second time for the explanation: the two would drift apart and the game
   would lie.
3. **`firstOrder` for every action kind** (`CONTRACTS.md` §5). Move the arithmetic of the worker's
   previews (`fiscalPreview.ts`, `tradePreview.ts`, `monetaryPreview.ts`, `laborPreview.ts`,
   `industrialPreview.ts`, `educationPreview.ts`, `constructionPreview.ts`, `politicsPreview.ts`)
   into `packages/sim`, one module per action kind, because the AI of S8 needs it. Each estimate
   says what it holds fixed.
4. **Interface.** The "why" sheet: contributions as bars, each with its drill and its levers. A
   forecast chip on every control; a slider shows the first-order effect while it is dragged.
5. **Projection, "Ask the model"** (`CONTRACTS.md` §5):
   - copy the world; freeze every other territory at its current prices and policies; switch the
     AI off; run only the player's territory's jobs;
   - run the baseline and the variant with **the same keyed random draws**, so the difference
     between them is the action and nothing else; label the result "same weather in both runs";
   - run in slices so the worker stays responsive; only while paused; cancel on unpause; cache;
   - show the two paths and their difference for the affected indicators over 6 to 24 months.
   Target: twelve months for a middle-sized country in at most ten seconds on the reference
   desktop. Report the measured time.
6. **Decision journal** (`CONTRACTS.md` §6). Record significant decisions (a law, a budget change
   above a threshold, a large construction order) with their forecast. At 90, 365 and 1,095 days
   compute the actual values and the gap, attributing the gap with `explain` of the change.
7. **Codex.** A generator reads the documentation comments of constants and formulas (agree a tag
   in the plan) into a data file; the interface shows a "How it works" page per indicator, linked
   from the "why" sheet.

### Acceptance

- Audit tests: every numeric field of every view has an indicator; every indicator's `explain`
  obeys rules 1 to 3 of `CONTRACTS.md` §4 within a stated tolerance; every action kind has a
  `firstOrder` that returns at least one estimate.
- A playtest at 844 × 390: tap the bread price → why → drill to its leading cause → a lever;
  change a tariff → forecast → commit → a journal entry; advance 90 days → the journal shows the
  outcome and the gap.
- A projection completes inside the target and leaves the live world's hash unchanged (test).
- `explain` and the projection add nothing to the cost of a simulated day (bench).

### Traps

Calling `explain` from a wheel job. A second copy of a formula. A `firstOrder` that hides long-run
guesses. A projection that mutates the live world, runs while unpaused or uses different draws in
its two runs. A journal that feeds back into the simulation. Explanations in words the game never
taught.

---

## S6 — The Gazette

**Goal.** The player knows what is happening in the world and at home, as a newspaper would tell
it, and the campaign leaves a chronicle.

### Build

1. **Emit world events** (`CONTRACTS.md` §8) from the systems that exist, at the point where the
   state changes. First set:

   | Area | Event types |
   |---|---|
   | Politics | law enacted; election result; government crisis; revolution |
   | War | war declared; province occupied or freed; peace signed |
   | Economy | price spike or collapse of a staple; closure of a major building; great construction finished; default or arrears; devaluation; currency adopted or founded |
   | Land and resources | harvest failure or bumper harvest; deposit discovered; deposit exhausted |
   | People | famine (deaths from food shortfall above a threshold); migration wave; population milestone |
   | Knowledge | technology completed; first in the world |
   | Records | one country overtakes another in the output of a major good or in product per head (checked yearly) |

2. **The log** in `World`: bounded, serialized, hashed.
3. **Worker:** ranking, merging of repeats, templates, and the `gazette` view (lead story and four
   more; sections for world, home, economy, war). The HUD's ticker shows the top story. The
   briefing "since you last played" and after a fast-forward lists the top stories since a day.
4. **Variety without randomness.** Each event type has three or more template variants; the
   variant is chosen by a keyed hash of the event id.
5. **Interface:** the Gazette tab of the World domain, laid out as a newspaper page at 844 × 390:
   masthead with the date, a lead headline with two sentences, section tabs. Tapping a story flies
   the map to its place and opens the figure behind it. Stories with a province pin the map for a
   few days.
6. **Chronicle:** the events of magnitude 60 or more as a timeline and a year-by-year list, kept
   for the whole campaign and exportable as text.
7. **Press law:** a label only ("official figures") until the law exists in S14.

### Acceptance

- An AI-only ten-year run emits every implemented event type; the Observatory reports the count
  per type and year. A great-power player sees between 5 and 40 stories a month above the
  relevance threshold: not none, not hundreds.
- A test renders every template variant against events from a run and finds no missing variable.
- The chronicle survives save and load. Emission costs nothing measurable; ranking fits the view
  budget.

### Traps

Text written in the simulation. Events created by the interface. An unbounded log. An event for
something that did not change. The same sentence every time. Stories the player cannot locate on
the map.

---

## S7 — Ambitions, a first mandate, era review, onboarding

**Goal.** The player has something to aim for and a way in.

### The rule that matters most

**Completing an ambition grants nothing by itself.** No bonus, no modifier, no points. An ambition
names an outcome that some groups already care about. Their support moves because the figure they
care about moved, through the model, whether or not the ambition was declared. What an ambition
adds is: visibility, a Gazette story, a milestone against history, and, when it was **promised**,
a real political fact: a promise made on a day to named groups, which costs their trust if broken.

### Build

1. **What groups care about.** Give each interest group a list of indicators it cares about, with
   weights (data). Their support for the government includes the trend of those indicators. Find
   how M8 computes group support today (`packages/sim/src/economy/politics.ts`) and extend it;
   S14 will replace it.
2. **Ambition catalogue** (data), about forty for the systems that exist. Each: an indicator, a
   comparison (an absolute target, a share of the world leader, own past), an optional deadline,
   and the groups that want it. Examples: literacy of 90 %; compulsory primary schooling in law;
   the eight-hour day in law; a balanced budget for five years; gold convertibility; steel output
   above a named rival's; under 10 % of the lower stratum below subsistence; child mortality
   halved.
3. **Offering.** The cabinet offers three at a time, chosen from what the governing coalition's
   groups want and what is feasible. The player holds up to three.
4. **A first mandate.** When a government forms (at the start and after an election), the leading
   demands of its coalition become promises with the term as deadline. Kept and broken promises
   are stored and move the trust of the groups concerned.
5. **Era review.** At fixed dates (propose them in the plan) the game shows four scores, each
   built from named indicators and shown with the country's rank: power, prosperity, liberty,
   stability. There is no single total.
6. **Milestones against history.** A data file of historical values at benchmark years for the 66
   countries, starting with population and product per head (Maddison Project, with attribution).
   "Your Italy in 1913 and Italy in 1913."
7. **Onboarding.** A guided opening of two years as one recommended country (ask the designer
   which). Eight to ten teaching cards, triggered by the state of the game and not by dates, each
   pointing at the real interface and skippable. After it, the country list carries a difficulty
   and a one-line pitch for each of the 66 countries (data).

### Acceptance

- A test completes an ambition in a small world and shows that nothing changed except the
  ambition's own status and one world event; group support moved only through indicators.
- A broken promise lowers the trust of the promised groups (test); a kept one does not grant more
  than the indicators already did.
- The guided opening runs end to end in a playtest at 844 × 390. The era review renders.

### Traps

A reward for completion. Goals on figures the player cannot influence. Goals that can only be met
by one path. A tutorial tied to dates or to a fixed sequence of taps. Scores that hide what they
are made of.

---

## S8 — The cabinet AI

**Goal.** Every other government runs its country with every lever the player has, for reasons it
records. Today the planner (`planCountryActions` in `packages/sim/src/economy/ai.ts`) sets the
income tax and the welfare budget and nothing else.

### Design (`CONTRACTS.md` §9; program §11)

1. **Wake-ups.** A ministry wakes when one of its card rules fires for its country (the same rules
   as the player's Desk, S4) and on its weekly day. A strategic review runs yearly and on shocks.
2. **Ministries and the levers that exist.**

   | Ministry | Actions it may propose |
   |---|---|
   | Finance | taxes and allowance, welfare, reserve target, issuing and repaying debt, debt policy |
   | Economy | trade policy, industrial policy and subsidies, support of public enterprises, starting, pausing and cancelling construction, monetary policy, adopting or founding a currency |
   | Interior | proposing laws in the active slots (and the relief law of S1) |
   | Education | school funding, research choice and staff share, training budget, stipend and staff share, health staff share, institution funding |
   | War | recruiting and deploying; **no declarations of war before S17** |

3. **Value.** Each proposal is valued on five scales (security, growth, welfare, prestige,
   ideology) using `firstOrder` and indicator values. The weights come from the strategic review:
   a table by regime and situation (data). The AI has no hidden score.
4. **The arbiter** picks the best affordable set under two real constraints: money (a projection
   of the treasury) and consent (the existing law-support rules). It commits to plans with a
   minimum duration and does not reverse inside it.
5. **Guardrails, in this order:** stay solvent; keep the population fed where the state has the
   means; then pursue the weights. At most a few actions per country per week.
6. **Reasons.** Every applied proposal stores its reasons. Add an `ai-reasons` view, and let the
   Gazette's templates use them ("Russia raises its grain tariff to protect the landowners in its
   coalition").
7. **Difficulty** sets the horizon and the error of the AI's estimates, with keyed draws.

### Acceptance

- **AI coverage test:** in an AI-only ten-year run, every action kind that lists a ministry is
  used at least once, and every use has a reason.
- Observatory metrics, with envelopes agreed in the plan: share of countries in default; budget
  balances; construction started; literacy growth; no country starved by its own treasury.
  Compare with the same run under the old planner.
- Determinism (two runs equal); the AI slice inside 15 ms a day.
- The player's country is never governed by the AI.

### Traps

One large function instead of ministries. Information the AI should not have. A hidden objective.
Reversing decisions every week. Hoarding reserves while people go hungry. Results that depend on
iteration order. Declaring wars before diplomacy exists.

---

## Release 1 — Peacetime: what must be true

- A new player completes the guided opening and plays ten years as a middle-sized country.
- The playtest log shows a decision every 60 to 90 seconds at the default speed and no idle
  stretch above three minutes.
- Every figure met in that play has a "why"; every action a forecast; the journal has entries
  with outcomes.
- The Gazette reports a world in which other governments visibly act, with reasons.
- An AI-only 25-year Observatory run stays inside its envelopes.
- The day is inside the budget of program §4.5 with all of Act II running.
- The designer has tested it on phones.
