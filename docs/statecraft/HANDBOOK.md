# Statecraft Program — agent handbook

Read all of this before any stage. It is short on purpose. Where it conflicts with `AGENTS.md`,
`AGENTS.md` wins. Where it conflicts with a stage brief, ask the designer.

Contents: 1 what we are building · 2 authority · 3 eight tests for every choice · 4 mistakes to
avoid · 5 the workflow of a stage · 6 measuring · 7 testing · 8 definition of done · 9 formulas,
coefficients and data · 10 words · 11 working with the designer

---

## 1. What we are building

A grand-strategy game for phones, 1900 to 2000, played in landscape. The player is the government
of a country. Three sentences hold the whole design:

1. **One world.** People, goods, money and power are simulated once and shared by every system. A
   soldier is a person who left a job in a province. A shell is steel that a mill made. A war loan
   is a bond that someone bought. No system keeps a private copy of reality.
2. **Legible.** The player can always see what is happening, why, and what can be done. Every
   figure has its causes one tap away. Every action shows a forecast before it is taken.
3. **Alive.** Other governments want things, act on them with the same rules as the player, and
   say why.

The designer's own priority, in their words: the game must be "fun, addicting, gives players
agency and allows them to understand the mechanics and the effects of their choices". When a
choice is between a more detailed simulation and a clearer or more playable game, the game wins,
as long as rules 1 to 3 hold.

What the game is not: a spreadsheet with a map; a game of meters and points; a re-enactment of
history; a tactical war game.

---

## 2. Authority (highest first)

1. `AGENTS.md` hard rules: determinism, simulation isolation, No-Mana, conservation, numerical
   integrity, mobile-first, no false claims.
2. The designer's instruction in the current task.
3. `docs/STATECRAFT_PROGRAM.md` (approved 2026-11-16), then your stage brief, then
   `CONTRACTS.md`.
4. The GDD, where the program did not amend it.
5. Existing code and tests. They show how things work today. They are not a reason to keep
   something the program replaces.

**Approved amendments to the GDD** (program §3 and §18): weekly market rounds and monthly
demography and labour replace the daily rules of GDD §3.4; invariants and statistical envelopes
replace 1900-world hash pins as the main regression guard; journals are weekly per account class
and cohort; subscribed views replace the full snapshot; P9 to P13 are two stages; the design bible
replaces the GDD's implementation records; tests run in three tiers. These apply from the stage
that implements each one, not before. Until S2 lands, the day is still fully daily.

**Still binding, with no exception granted:** no legacy saves and no migrations (bump the schema,
reject older saves); one thread (D-163); never detach an `ArrayBuffer` on the simulation thread;
`pnpm` only; LF line endings; device testing belongs to the designer.

---

## 3. Eight tests for every choice

Apply these whenever a brief leaves something open. If a design fails one, change the design.

| Test | Question | Fails when |
|---|---|---|
| Cause | What creates this quantity and what uses it up? | It grows or shrinks because time passed, or you cannot name both |
| Conservation | Do people, goods and money that go in come out? | A count appears, vanishes or is clamped |
| Same rules | Can the AI do this with the same validated action and the same information rules? | The player has a lever the AI lacks, or the AI gets a bonus |
| Why | Can the player see the leading causes of this figure in one tap? | The figure has no indicator definition (CONTRACTS §4) |
| Forecast | Does the action show its effect before the player commits? | The player must act blind |
| Phone | Does it work at 844 × 390 in landscape with a thumb, 44-point targets and no hover? | It needs a mouse, a wide table or small text |
| Budget | Which wheel and slot runs it, and what does it cost? | It runs for every entity every day, or its cost was not measured |
| Decision | Does it give the player a choice with a real trade-off? | One answer is always right (then automate it) or nothing the player does matters |

---

## 4. Mistakes to avoid

Each of these is tempting, and each has been the wrong answer in this design.

| Temptation | Why it is wrong | Do this instead |
|---|---|---|
| "Technology X gives +10 % output" | A modifier with no cause; it is what the program removes | A production method with its own inputs, labour and capital, adopted by investment (program §10) |
| A stored scalar that ticks: `warExhaustion += 0.1` a day, a stored "tension" or "legitimacy" that accumulates | A meter (No-Mana). It drifts away from the state that should cause it | Derive it on demand from state (casualties, prices, mobilisation). Cache it only as a discardable cache |
| A points cost to pass a law or sign a treaty | Mana | Real consent: votes of seats, consent of pillars, terms the other side values |
| `if (year === 1914) declareWar()` or any dated script | Scripted history; removes agency and breaks other starts | Structural pressure: a hazard that rises from simulated causes, a keyed draw, starting data for 1900 |
| Tuning coefficients until a table looks right | Hides a structural fault; the fault returns elsewhere | Diagnose the mechanism first (single-cause experiments, S1 brief), then fix structure, then calibrate |
| Clamping (`Math.max(0, x)`) to stop a negative stock, cash or count | Hides a conservation failure (`AGENTS.md` §3) | Find where the quantity was double-spent; fix the cause; clamp only a documented model domain |
| Changing a test, pin, band or tolerance to get a green build | Removes the guard | Stop and ask. Show what changed and why the old expectation is stale |
| A new loop over all blocks, buildings or provinces every day | The day budget is 200 ms; this is how it was lost | Register a wheel job with a slot and a measured cost (CONTRACTS §1) |
| Rescaling a constant by hand for the new cadence ("multiply by 7") | Month lengths and leap years make it wrong; units become unclear | Keep the constant per day or per year; the job multiplies by the exact days elapsed (CONTRACTS §1.3) |
| Reading the clock to schedule or to measure inside `packages/sim` | Breaks determinism and the isolation rule | Schedules come from data and stable ids. Timing is measured only in `packages/bench` |
| A new field on the full snapshot | The snapshot costs about 285 ms a day and is being removed | A view with a cadence (CONTRACTS §3) |
| Objects and `Map<string, …>` in a hot loop; allocating per row | Garbage collection was 10 % of the day | Typed columns indexed by numeric id; reuse scratch buffers (D-158 to D-161) |
| Simulation logic in the app, or the app importing simulation internals | Breaks the boundary; the phone and the web would diverge | The worker computes; the app renders views and sends validated commands |
| A number on screen without unit, period and "why" | The player cannot interpret it | Indicator definition with unit, period and attribution (CONTRACTS §4) |
| A Desk card with one sensible option, or cards for routine events | Decision fatigue; the player stops reading | A report, or automation with a rule the player sets |
| An AI that cheats, sees other countries' private state or acts on a timer | The world stops being believable | The AI observes what an embassy would report and proposes actions through the same validator |
| Giving a heritage or faith group a trait, bonus or penalty | Forbidden by design (program §6 rule 1) and wrong as a model | Differences come from law, conditions and institutions only |
| Unkeyed randomness, `Math.random`, `Date` | Breaks determinism | The keyed generator with a stable purpose id and entity, day and draw context |
| Keeping an old code path "for compatibility" | The designer wants no legacy code or saves | Delete what the stage replaces, in the same stage |
| Building parts of a later stage "while here" | Stages are reviewed one at a time; hidden scope breaks later briefs | Note it in the report as a proposal |
| A new dependency | Compatibility on three platforms; the lockfile | Propose it in the stage plan and wait |
| Text typed into components | Cannot be translated or audited | String tables with keys (CONTRACTS §13) |
| The former names of the game or of the unit of account in current text | The branding and monetary audits fail | "Fabric of Nations" and "RUSD" |
| "Verified on device", "runs at 60 fps", "feels smooth" | Not measured by you | Say what you ran, where, and what the designer should test |
| Treating a hypothesis or estimate in these documents as fact | They were written before the code | Check in the code and by measurement; report what is wrong |

---

## 5. The workflow of a stage

Follow the steps in order. Do not skip a stop.

**Step 1 — Orientation (no changes).** Read the documents of the README's reading order. Check the
repository state (`git status`, the branch, the last completion report). List the files your brief
names and confirm they exist and still do what the brief says.

**Step 2 — The stage plan.** Write `docs/statecraft/plans/S<nn>_PLAN.md`:

- what you will build, in your own words, and what you will not;
- what you found that differs from the brief;
- the data model changes (state, save schema, protocol) and the files you expect to touch;
- the tests you will write first and the measurements you will take;
- your steps, each small enough to commit on its own;
- numbered questions (Q1, Q2, …), each with your recommended answer. Ask about every choice the
  brief leaves open and every conflict you found.

**STOP. Wait for the designer's answers.** Record them in the plan (§0 "Answers").

**Step 3 — Baseline.** Before changing code, record what the stage will be measured against: the
tests that pass now, and the benchmark figures of §6 if the stage touches the simulation.

**Step 4 — Tests first, then code, in small steps.** For each step of your plan: write or update
the tests, implement, run the affected suites, commit on the stage branch
(`statecraft/s<nn>-<short-name>`). A commit must leave typecheck and the fast tests green.

**Step 5 — Measure** (§6) and compare with the baseline and the stage's budget.

**Step 6 — The phone.** If the stage has interface work: build it from the tokens at 844 × 390,
export web, iOS and Android (`pnpm app:export`), and extend or add a playtest script
(pattern: `scripts/p7/playtest-labour.mjs`). List what the designer should test on a device.

**Step 7 — Close.** Write the completion report (`docs/statecraft/reports/S<nn>_REPORT.md`, in the
form of `docs/P7_COMPLETION_REPORT.md`): commits, files, behaviour, measurements, commands and
results, each acceptance criterion with its evidence, open items. Add the decision entries to
`DECISIONS.md` and run `node scripts/docs/decisions-index.mjs`, then the same with `--check`.
Update the status table in `docs/statecraft/README.md`. Correct any program document the stage
proved wrong.

**Ask before merging or pushing.**

**Stop and ask at any point when:**

- the brief and the code disagree, or two documents disagree;
- an acceptance criterion cannot be met, or you believe it is wrong;
- the save schema, the worker protocol or a public contract must change in a way the plan did not
  list;
- a dependency, a data source or a licence question appears;
- a test, pin, band or tolerance would have to change;
- the work would touch another stage's system;
- a long run shows the world going wrong (falling population, runaway prices, mass unemployment),
  even if no test fails.

**Versions.** Bump `WORLD_SCHEMA_VERSION` (`packages/sim/src/constants.ts`) once per stage that
changes the save, `SIM_VERSION` once per stage that changes results, `PROTOCOL_VERSION`
(`packages/sim-worker/src/protocol.ts`) once per stage that changes the protocol. Older saves are
rejected, never migrated.

---

## 6. Measuring

Node figures on the desktop are diagnostics. Never state a phone figure.

**Protocol** (until S3 replaces parts of it): a quiet machine; three runs; report the median and
all three; report the machine, the Node version and the heap flag.

```bash
pnpm run build:libs
```

```bash
pnpm -F @century/bench build
```

```bash
node --max-old-space-size=4096 packages/bench/dist/perfPhases.js 2 12
```

```bash
node --max-old-space-size=4096 packages/bench/dist/perfPhases.js 0 32
```

```bash
node --max-old-space-size=4096 packages/bench/dist/perfBench.js 52
```

- `perfPhases 2 12`: ordinary days, per phase. `perfPhases 0 32`: the whole first month with its
  month end and its monthly labour phase. `perfBench 52`: the worker host's step, the snapshot,
  save and load.
- Reference figures before S1 (D-166, Ryzen 5 2600, Node 24, 4,096 MB heap): ordinary day 929 ms;
  month mean 1,082 ms; worst day 4,167 ms; host step 1,358 ms.
- Long runs: `packages/bench/scratch/longrun.mjs` is untracked local tooling. S1 promotes it to a
  tracked tool; until then ask the designer for it if it is missing.
- When a stage changes the simulation, report the budget table of program §4.5 with your figures
  next to the targets.

---

## 7. Testing

- The full `pnpm test` takes about 100 minutes until S3 splits it. Run it in the background once,
  before closing a stage. During the work run single suites from `packages/tests`:

```bash
node --max-old-space-size=900 --experimental-vm-modules ./node_modules/jest/bin/jest.js src/economy/labour-market.test.ts
```

- Keep the D-155 test rules: the jest configuration, the 900 MB heap, one 1900 world per test.
- Every stage adds: unit tests of each new rule; a conservation test for every quantity it moves
  (people, goods, money); a determinism test (two runs, equal state hash) and a save round trip
  (encode, decode, equal hash) for new state; a regression test for every bug found.
- **Cause-isolating fixtures.** A behaviour test builds a small world, changes one cause and
  asserts the direction and rough size of the effect ("a bad harvest in a province with poor
  access raises its bread price"). This is the kind of test the program trusts. A pinned hash only
  proves that nothing changed.
- Checks before every commit: `pnpm typecheck`, `pnpm lint`, the suites you touched. Before
  closing: also `pnpm audit:branding`, `pnpm audit:monetary`, `pnpm run check:sim-deps`,
  `pnpm run check:worker` (run `pnpm -F @century/app build:worker` first when the simulation or
  the worker changed), `pnpm map:atlas:check` when tokens or the map changed, `pnpm bench`, and
  `pnpm app:export` when the app changed.

---

## 8. Definition of done

A stage is done when, for every system it adds or changes, the report shows each of these with
evidence. If one does not apply, say why.

| # | Item | Evidence in the report |
|---|---|---|
| 1 | The Desk cards the system raises | The card kinds, their options and their defaults; a playtest that reaches one |
| 2 | Its lens and place-sheet rows | Screenshot at 844 × 390; the lens's one-sentence reading |
| 3 | Its Gazette events | The event types and one sample headline each, generated from a run |
| 4 | AI use of every new action | The AI coverage test passes; an AI-only run shows each action used at least once, with reasons |
| 5 | "Why", forecast and codex entries | Every new indicator and action is in the registries; the audit test passes |
| 6 | Wheel jobs within budget | The load map and the per-job cost against program §4.5 |
| 7 | Tests | The list of §7, all passing; Observatory metrics with their envelopes (from S3) |
| 8 | Phone | Web, iOS and Android exports succeed; the playtest script passes; what to test on a device |
| 9 | Records | Completion report, decision entries, status table, corrected documents |

Before S4 exists, items 1 to 3 and 5 cannot be built. Stages S1 to S3 instead leave what those
items will need: indicators defined with units, events emitted, figures reported.

---

## 9. Formulas, coefficients and data

- Every coefficient lives in the constants module of its package with units, a justification, a
  source where there is one, and a status: `SOURCED`, `CALIBRATED` or `PROVISIONAL`. Copy the form
  used in `packages/sim/src/economy/constants.ts` (for example `WAGE_FALL_PER_GAP`).
- Every formula is documented where it is implemented: inputs, units, cadence, bounds, intended
  effect. The codex of S5 is generated from these comments, so write them for a player to read.
- Rates stay per day or per year. Jobs multiply by the days elapsed (CONTRACTS §1.3).
- People and discrete items are integers. Split with the existing largest-remainder apportionment
  (`packages/sim/src/economy/apportion.ts`) and keyed tie-breaks.
- Historical content is data, not code. A data file has a source table, a generator script with a
  `--check` mode, and a provenance document, as P2, P4, P5b and P7 did. Download only from sources
  whose licence allows it, into a new empty folder under a git-ignored `.cache-*` directory. Do not
  work around a site that blocks scripted downloads; ask the designer to fetch the file.
- Initial buildings follow sourced 1900 output or the people who worked there, never reserves,
  land or potential (designer's rule of 2026-11-10).
- A value without a source is marked provisional in the data and shown as provisional in the
  interface.

---

## 10. Words

**Player-facing text.** Plain and short. Name the thing and give the figure with its unit and
period: "Bread costs 12 % more than a year ago in Naples." No jargon the game has not introduced.
No exclamation marks. Sober wording for war, famine and persecution: report what happened and to
whom. British spelling, as in the existing interface.

**Glossary** (use these words; do not invent synonyms):

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

---

## 11. Working with the designer

- The designer decides design; you decide implementation. When a question changes what the player
  experiences, what a figure means or what history the game allows, it is the designer's.
- Ask numbered questions with a recommendation and the consequence of each answer. Do not ask what
  you can find in the code.
- Report results as they are. A failed criterion, a slower day or a world that goes wrong is
  information the designer needs; say it first, with the figures.
- The designer tests phones personally. End every interface stage with a short list of what to
  try on a device and what you could not verify.
- If you run out of context or time in the middle of a stage, leave the branch committed and write
  in the stage plan what is done, what is next and what you were unsure of, so that another agent
  can continue.
