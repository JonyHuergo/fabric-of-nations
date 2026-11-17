# Act I — Ground (S0 to S3)

Nothing later can be judged until these are done: a world that holds for 25 years, a day that
costs 200 ms, and a way to measure a hundred years in an afternoon. No stage of this act adds a
feature the player sees. Resist adding one.

Order: S0 → S1 → S2a → S2b → S2c → S3. One sub-stage per task and per session.

Read first: `HANDBOOK.md` (all), `CONTRACTS.md` §1 to §3 and §14, program §4 and §5.

---

## S0 — Approval and the design bible

**Goal.** Record the approval of the program in the decision register, and turn the GDD from a
7,000-line record into a short design bible. Documents only; no code.

**State.** The designer approved the program and its ten decisions on 2026-11-16. `AGENTS.md` §1
and §8 already point to the program. `DECISIONS.md` has no entry for it yet, because the P7 close
(steps 7 and 8: D-170 save storage, D-171 map pipeline) was still uncommitted when the program was
written.

**Steps.**

1. Confirm the P7 close is finished: `git log` shows the D-170 and D-171 commits and
   `node scripts/docs/decisions-index.mjs --check` passes. If not, stop and ask the designer.
2. Write the decision entry with the next free number, headed like D-154 onward:
   `## D-NNN (statecraft S0) — The Statecraft Program approved`. Content: the date; the ten
   decisions of program §18 word for word; the GDD rules each one amends; the Prosperity stages it
   supersedes (program §5.2); the documents in `docs/statecraft/`. Run the index script, then
   `--check`.
3. In the stage plan, propose the outline of the design bible and the table "GDD section → where
   it goes". **Stop for approval.**
4. Rewrite `Fabric_of_Nations_GDD.md` (the file name stays; `AGENTS.md` refers to it):
   - Part A, the game: vision, the six design pillars, the pillars of play, the loop (GDD §1 and
     program §2).
   - Part B, binding doctrine: No-Mana (GDD §2 unchanged), the calendar (GDD §3.1 to §3.3), cadence
     (program §4 replaces GDD §3.4), determinism and state rules (GDD §4.1, §5.1), accounting
     principles (GDD §8.1).
   - Part C, systems: one short section per system (population, economy, money, politics,
     technology, diplomacy, war, country AI, interface, news). Each says what is implemented today,
     in which stage, and where its specification is (a Statecraft brief or an archived record).
   - Part D, glossary (GDD §21 plus handbook §10).
5. Move the implementation records (GDD §17 to §17J and the stage tables of §12) **verbatim** to
   `docs/archive/gdd/`. Move, do not rewrite. Before moving, read
   `scripts/m13/branding-audit.mjs` and `scripts/m14/monetary-terminology-audit.mjs` to see which
   paths count as historical, and search `packages/tests` and `scripts` for anything that reads
   GDD headings.
6. Update `docs/PROSPERITY_PROGRAM.md` (status line: stages after P7 continue in the Statecraft
   Program, with the table of program §5.2), the root `README.md`, and the status table in
   `docs/statecraft/README.md`.

**Acceptance.** Every binding rule of the old GDD is in the new one or was amended by a named
decision; the report's table accounts for every old section. Audits pass: `pnpm audit:branding`,
`pnpm audit:monetary`, the decisions index check, `pnpm lint`. No file under `packages/` changed.

**Traps.** Do not improve or re-decide rules while moving them. Do not delete history. Do not
describe a planned system as implemented.

---

## S1 — A stable economy

**Goal.** The 1900 world runs 25 years without player input and stays a plausible world. Today it
collapses within five.

### What is known (P7 completion report §4.2, ten-year run, seed 20261023, AI on)

| | 1900 | 1901 | 1905 | 1910 |
|---|---:|---:|---:|---:|
| Unemployment | 2.6 % | 8.8 % | 18.7 % | 25.2 % |
| Lower stratum below subsistence | 0.1 % | 77.4 % | 99.3 % | 99.0 % |
| Population (M) | 1,584 | 1,581 | 1,501 | 1,452 |
| Peasants (M) | 198.6 | 181.6 | 128.6 | 88.3 |
| Laborers: labour force (M), unemployed | 128.5, 3.9 % | 130.2, 14.5 % | 172.5, 24.2 % | 212.3, 33.0 % |
| Grain / produce price against 1900 | 1.00 / 1.00 | 0.66 / 0.64 | 0.72 / 0.63 | 0.69 / 0.63 |
| Cotton against the 1900 crop | — | 0.81 | 0.45 | 0.36 |

Food is plentiful and cheap, yet people cannot buy it. That is a failure of incomes and demand,
not of supply.

### Where the mechanisms are

| Mechanism | Files and names |
|---|---|
| Day pipeline | `packages/sim/src/economy/day.ts` `runEconomicDay` |
| Wages, staffing ceilings | `economy/labourMarket.ts` `updateLabourMarketMonth`, `updateStaffingCeilings`, `buildingProfitability`; constants `WAGE_RISE_PER_GAP`, `WAGE_FALL_PER_GAP`, `STAFFING_CEILING_RATE` |
| Mobility and migration | `economy/mobility.ts` `runMobility`, `runLabourMigration`, `expectedIncome`; constants `MOBILITY_THRESHOLD`, `MOBILITY_RATE_PER_PRESSURE`, `MOBILITY_AHEAD_OF_JOBS_SHARE`, `LABOUR_MIGRATION_*` |
| Demand and saving | `population/demandSystem.ts`, `economy/householdDemand.ts`; constants `MARGINAL_PROPENSITY_TO_CONSUME` (lower 0.94, middle 0.85, upper 0.60), `WEALTH_CONSUMPTION_RATE_PER_YEAR` (0.04), `CASH_RESERVE_DAYS` |
| Prices | `economy/market.ts`; constants `M3_PRICE_MAX_DAILY_CHANGE`, `M3_PRICE_MIN_RATIO`, `M3_PRICE_MAX_RATIO`. The report's floor of 0.632 × the 1900 price: find the rule that produces it |
| Profits | `economy/profit.ts`, `economy/settlement.ts` |
| Construction (state only today) | `economy/construction.ts`, `economy/constructionModel.ts` |
| Welfare | `economy/fiscal.ts`; the AI planner in `economy/ai.ts` |
| Peasants' own consumption, land | `economy/agriculture.ts`, `economy/land.ts` |
| Long-run tool | `packages/bench/scratch/longrun.mjs` (untracked) |

### Method (in this order; do not skip to fixing)

1. **Reproduce.** Run two years and match the 1901 column above. One simulated year takes about
   7.5 minutes. Promote the long-run script to a tracked tool (`packages/bench/src/longRun.ts`)
   that writes the yearly table as JSON and Markdown.
2. **Flow of funds.** Add a probe (bench only, not in the simulation's result) that writes, per
   month: for each holder class, opening cash, income by source, spending by use and closing cash.
   Holder classes: households by stratum; buildings' operating cash by sector; treasuries;
   institutions; every system or non-simulated account (suppliers, the mint, any sink). The
   closing balances of all classes must add up to the opening ones: the money is somewhere. Find
   which classes accumulate it and stop spending it. Also record employment, vacancies and
   staffing ceilings by profession, the stock cover of each good in days, and the number of goods
   at a price bound.
3. **Single-cause experiments.** In a scratch build that is never committed, switch one mechanism
   off at a time, run 24 months, and fill this table:

   | Experiment | Change | Unemployment at 12 / 24 months | Below subsistence | Textile output | Cash by stratum |
   |---|---|---|---|---|---|
   | E0 | none (reference) | | | | |
   | E1 | no saving: propensity to consume 1 for every stratum | | | | |
   | E2 | no mobility and no migration | | | | |
   | E3 | no arrivals ahead of jobs (`MOBILITY_AHEAD_OF_JOBS_SHARE` 0) | | | | |
   | E4 | staffing ceilings frozen | | | | |
   | E5 | no price floor | | | | |
   | E6 | wages fall as fast as they rise | | | | |

   The experiment that removes most of the collapse names the main cause. Expect more than one.
   These switches are instruments, not fixes.
4. **Write the diagnosis** (`docs/statecraft/reports/S01_DIAGNOSIS.md`): the flow-of-funds
   evidence, the experiment table, the mechanism in plain words, and the structural fixes you
   propose with their costs. **Stop for the designer's approval.**
5. **Fix**, one mechanism per commit, each with a cause-isolating test (handbook §7).
6. **Run** ten years, then 25 years in the background (about three hours at today's speed), and
   report the table of P7 §4.2 for both.

### Hypotheses to test (these are not facts)

| # | Hypothesis | Why it is suspected | Test |
|---|---|---|---|
| H1 | Saving has no way back into spending. The upper stratum saves 40 % of its income above the committed cost and draws down 4 % of its cash a year. Nobody invests privately, so saved money leaves demand; with wages slow to fall, output and jobs fall instead | Produce at its floor from 1902; purchases fall while farm output does not; private investment does not exist before S10 | Flow of funds: do upper-stratum households and firms accumulate cash while sales fall? E1 |
| H2 | Nothing replaces a lost wage. A block has one cash account, so its employed members carry its unemployed, but there is no informal work and little relief | P7 report §4.2 | Lower-stratum income by source; share of blocks with no wage income |
| H3 | Mobility overshoots. It uses expected income `wage × (1 − unemployment) × housing`. At the 1900 gap (peasant 174 against laborer 1,273 RUSD a year) the flow stops only near 86 % unemployment, and 5 % of the destination's labour force may arrive ahead of jobs each month | Peasants 198.6 M → 88.3 M while a third of laborers are unemployed | E2, E3; compare the two incomes on one basis (own consumption in kind, rural against urban prices) |
| H4 | Supply ignores gluts. Peasants and farms keep producing into stocks of thousands of days | P7 report: produce stock 65,425 days in 1910 | Stock cover by good; E5 |
| H5 | Salaried professions are over-entered | Bureaucrats 4.7 M → 30.5 M; clerks 58 % unemployed | Entries against vacancies by profession |
| H6 | The demand spiral: lower sales lower the staffing ceilings, which lower incomes and sales | P7 report: textile output 2.5 M → 8 thousand units a day | E4 |

### What a correct fix looks like (the design intent)

- **Saved money becomes someone's spending through a real channel.** The intended channel is
  private investment: an owner whose building has been profitable for a year and is staffed to its
  ceiling orders an expansion through the existing construction system, paid from the owner's cash
  above the reserve. Construction buys materials and labour, and that is how the money returns.
  This is the first slice of S10; write it so S10 extends it.
- **A person without a wage job does low-productivity work that produces something real.** In the
  countryside: subsistence farming on the block's land with diminishing returns (the P5a land
  model). In towns: casual services sold in the local market at the market price, so that informal
  income falls as more people crowd in.
- **Relief is a law**, paid from the treasury through the existing welfare path, tested against
  the committed basket. 1900 defaults are sourced where a source exists, provisional otherwise.
- **Movers compare real incomes on one basis**, and arrivals ahead of jobs are small and
  justified. A worker can go back to the land.
- **Producers respond to unsold stock**: an inventory target, spoilage for perishable goods, and
  a price floor only where it has a stated reason.

**Forbidden shortcuts:** creating money; a transfer with no payer; raising the propensity to
consume to hide the leak; clamping unemployment, prices or population; tuning the provisional
labour coefficients until the table looks right; changing the acceptance bands.

### Also in S1

| Item | Source |
|---|---|
| First week of the United States market: ten imported goods with no sellable supply | D-167 |
| 61 Russian and 13 Italian cotton mills left unplaced | D-166 |
| Flax (Germany, Italy, Sweden, Japan), hemp (United States, Japan, China) and ramie coverage | D-166 |
| The year's demographic record is written after the year's last checkpoint | P7 report §4.2 |

### Acceptance

- 25 years without player input, no failed day. Outside war and famine: under 15 % of the lower
  stratum below subsistence; births above deaths in the countries that grew historically;
  unemployment between 2 % and 12 %; textile output rising; no price at a bound for more than a
  year. World product per head reported against Maddison's 1.3 % a year (1870 to 1913). Bands are
  provisional; if one cannot be met, stop and ask.
- People, goods and money conserved exactly in every run. Determinism and save round trip.
- The ordinary day is not more than 10 % slower than before (S2 follows).
- The diagnosis document, the experiment table, and one cause-isolating test per fix.
- The relief law, if added, is in the existing law interface on the phone layout.

**Out of scope.** Performance, cadence, new screens, firms as entities, banks.

---

## S2 — The Clockwork

**Goal.** The published day costs at most 200 ms (worst day) and 120 ms (mean) on the reference
desktop, with the same world behaviour within stated tolerances. See program §4 and
`CONTRACTS.md` §1 to §3. This stage is three sub-stages, each with its own plan, branch and
report.

**The comparator for all three.** Before changing anything, run the S1 build for three years and
save its yearly aggregates as the *daily reference*: output by good family, consumption per head
by stratum, a price index per territory, employment by profession, population, births, deaths.
Every sub-stage is compared with it. Hash pins cannot serve here, because the cadence changes the
arithmetic. Differences are expected and must be explained; the tolerance per aggregate is agreed
in the plan.

### S2a — The scheduler and the monthly wheels

1. **Baseline** (handbook §6) and the daily reference.
2. **The registry, with no change in behaviour.** Register every existing phase of
   `runEconomicDay` as a day job in today's order and drive the day from the registry. The
   existing pins must still pass. Commit.
3. **The inventory.** In the plan, list every phase of the day with: what it does, its cost
   (D-161 table), the wheel it moves to, the unit of its slot, and why. **Stop for approval.** This
   table is the design of the stage.
4. **The schedule** (`CONTRACTS.md` §1.2): state, data file, generator with `--check`, and the
   load map in `packages/bench`.
5. **Move the monthly phases, one per commit:** demography first (`population/demography.ts`),
   then education, training, health, unrest and militancy, political indicators, wealth. For each:
   apply the elapsed-days rule (`CONTRACTS.md` §1.3), write the two-cadence test, compare with the
   daily reference.
6. **The labour month.** Profile `runLabourMonthPhase` first (it is about 4.2 s in one day).
   Slice it by territory over the month wheel. Target: 600 ms a month in total.
7. **Re-record the determinism pins once**, at the end, with the evidence, after the designer
   approves.

Acceptance: no day costs more than twice the mean day; the monthly spike is gone; every moved
phase conserves exactly; determinism and save round trip; the comparison with the daily reference
is inside the agreed tolerances.

### S2b — The market week, cohorts and weekly journals

1. **A fixture first.** A world of two territories. Write the weekly round as one job for one
   territory, in today's order but for the period: production and extraction → production demand →
   household demand → clearing → the price step → wages, profits and taxes → trade dispatch.
2. **Period arithmetic** by the elapsed-days rule. Smoothing and the price bound by
   `CONTRACTS.md` §1.4.
3. **Trade between territories with different market days.** A shipment carries its arrival day
   and enters the destination's stock when it arrives. The exporter decides on the destination's
   last posted prices. Write the swap-order test (`CONTRACTS.md` §1.5).
4. **Stagger the market days** from the schedule.
5. **Cohorts** (`CONTRACTS.md` §2) with the three tests.
6. **Weekly journals.** One posting per account class, cohort and round. The month's close and
   the finance reports read period totals. The accounting identity tests stay.
7. Everything else that was daily and touches a market (exchange rates, the mint, in-kind wages,
   minimum-wage coverage) goes on the market day of its territory, by the same rules. The
   inventory of S2a already listed them.
8. Compare with the daily reference over three years and explain each difference.

Acceptance: the market phases are inside their budget line; conservation exact; the two-cadence,
swap-order and cohort tests pass; the comparison is inside tolerance; the ten-year run still meets
S1's acceptance.

### S2c — Views and saves

1. **The view registry** in `packages/sim-worker` (`CONTRACTS.md` §3) and the subscribe protocol.
2. **Port what exists**: the HUD, the data of each of the thirteen screens, the province panel
   and the map lenses become views. The screens keep their look; S4 redesigns them. Each numeric
   field is mapped to an indicator id with a unit (`CONTRACTS.md` §4); `explain` may return
   nothing until S5.
3. **Remove** the full snapshot (`snapshot.ts`) and the protocol parts it needed. Do not keep both.
4. **Saves.** Propose a columnar form in the plan. Constraints: the storage backend stores strings
   in chunks (D-170); no detached buffers; target under 4 M characters and under one second to save
   on the reference desktop; older saves are rejected.
5. Playtest scripts at 844 × 390; web, iOS and Android exports.

Acceptance of S2 as a whole: worst day ≤ 200 ms and mean ≤ 120 ms over 1900 to 1902, measured by
`perfBench` with the HUD and one screen subscribed; the load map and the budget table of program
§4.5 with measured figures; ten years in at most 15 minutes; memory of the simulation context
reported; the old paths deleted. If the target is missed, report where the time goes and stop: the
next step (WebAssembly or another idea) is the designer's decision.

### Traps of S2

- Making weekly constants by hand instead of using the elapsed-days rule.
- Assuming seven days or thirty days. Months and leap years vary; the first run after a new game
  or a load covers whatever days have elapsed.
- Letting a territory read another's result of the same day.
- Scheduling from measured time at run time.
- Losing the rationing tiers, in-kind consumption or the minimum-wage rules while regrouping
  demand into cohorts.
- Keeping the daily path alive behind a flag "for comparison". The daily reference file is the
  comparison.
- Re-pinning hashes without showing why they changed.

---

## S3 — The Observatory and the test tiers

**Goal.** Many seeds over many years measured unattended against bands, and a test suite fast
enough to run on every change.

**The Observatory** (tracked, in `packages/bench`):

- A command (`pnpm observe`) with options for seeds, years, scenario and output folder. It runs
  the seeds one after another on one thread and writes per seed a yearly metrics file, then an
  aggregate and a static HTML report with inline charts and no new dependency.
- Metrics, first version: the columns of P7 §4.2; product per head by country against Maddison
  1900 to 1913; population against the P4 sources; a price index per territory; employment
  structure; unemployment; cost per wheel job. Later stages add theirs (wars, regimes, the Great
  War incidence, AI budgets).
- **Envelopes**: a committed file of bands per metric and year, each with its source or reason
  and a status (sourced, provisional). The command exits non-zero on a breach and names it. S1's
  acceptance bands are the first envelopes.
- Seeds vary the world seed, and so the harvests and every keyed draw.

**Test tiers** (handbook §7 becomes this):

| Tier | Command | Content | Target on the reference desktop |
|---|---|---|---|
| Fast | `pnpm test:fast` | Fixtures and small worlds | ≤ 5 minutes |
| World | `pnpm test:world` | One 1900-world month; replay and save equality; the budget check | ≤ 20 minutes |
| Observatory | `pnpm observe` | Seeds × years against envelopes | hours, unattended |

`pnpm test` runs fast then world. Sort the existing 114 suites into the tiers by what they load;
propose the sorting in the plan. Keep the D-155 memory rules. 1900-world hash pins are reduced to
the determinism checks (same build, same hash; save round trip); the envelopes take over the job
of noticing that behaviour changed.

**Playtest log.** Define the format and add the worker counters now (commands issued per simulated
month, time between commands). The interface side arrives with S4.

**Acceptance.** Fast and world tiers inside their targets, with times reported; `pnpm observe`
with four seeds over ten years completes and produces the report; S1's bands are encoded and
pass; the handbook's §6 and §7 are updated to the new commands.

**Traps.** Dropping a behaviour test while sorting. Making an envelope so wide it cannot fail.
Adding a charting dependency.
