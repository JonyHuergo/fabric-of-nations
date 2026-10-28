# Century — M0–M7 shell, M7a annual accounting, E0 design, E1 economic clarity, E2 fiscal management, E3 public construction, E4 industrial policy, M8 laws and institutions, M9 technology and education, and E5 labor and social institutions

Century is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, with one simulated civil day
per tick.

The repository currently implements **M0 (project foundation)**, **M1
(simulation core)**, **M2.1 (corrected population core)**, **M3a (economy
definitions, state, validation, and serialization)**, **M3b (deterministic
employment assignment)**, **M3c (production, input reservations, and inventory
movement)**, **M3d (deterministic two-pass market clearing with bounded
prices)**, **M3e (cash settlement, wages, upkeep, retained producer profit, and
household cash)**, **M3f (integrated daily economic tick)**, **M4a-1
(category-aware double-entry accounts, opening balances, and recognition legs)**,
**M4a-2 (country/currency identity, monetary arrangements, and SUSD-relative
valuation)**, **M4b (monthly finance period close and immutable finance
summaries)**, and **M4c (per-country treasury, daily income tax, and budgeted
welfare transfers)**, **M5 (multi-region/multi-country worlds, shared
markets, migration, labor mobility, and the initial historical-data pipeline with
eight authored polities)**, **M5a (retained-profit accounting, private profit
distributions, state-enterprise ownership, and treasury remittances)**, and
**M5b (versioned public debt, deficit financing, interest, maturity/refinancing,
arrears, and default)**, **M6 (deterministic country AI v1, persisted AI
schedule/goal state, shared player/AI fiscal-policy action validation, AI stress
fixture, and opt-in full-campaign performance report)**, and **M7 (versioned
simulation worker protocol, immutable snapshot bus, six-screen Expo/React Native
shell, player fiscal action, pause/step/speed, compressed save/load, and
web/headless verification)**. **E1 (Economic Clarity and Monthly Reports)** adds a
national overview, evidence-based diagnosis, fiscal-policy previews, bounded monthly
economic reports, and a session-confirmed action history without adding an economic
mechanic. **M7a (Annual Accounting)** adds bounded annual summaries, year-end
treasury/debt balances, partial-year handling, and audited controlled corrections.
**E2 (Fiscal Management)** extends the fiscal loop into a public budget: an
income-tax exemption schedule, welfare eligibility and a treasury reserve floor, a
month-end business-profit tax with its own accounts and posting kind, budget
decomposition in monthly/annual reports, and validated player borrowing, principal
repayment, and refinancing/ceiling actions. **E3 (Public Investment and Construction)**
adds a validated project queue that hires real idle labor, pays construction wages over
time, capitalizes work-in-progress, and completes into state-owned productive
buildings. **E4 (Industrial and Business Policy)** adds validated building sectors,
construction material requirements bought from actual market stock, sectoral
production subsidies paid against verified output, and public-enterprise capital
support, with balanced accounting and reporting. **M8 (Laws and Institutions)** adds
authoritative regimes, laws, elections, seven derived interest groups, regional
unrest and crisis/revolution, clerk-staffed administration with cash-limited payroll
and quality/overload effects, and a bounded scripted-event queue with provenance.
Only taxation, suffrage, education (added by M9), labor, health (added by E5), and
trade law slots expose options; military service, colonial policy, and currency remain
later-stage dependencies. AI law/funding actions and player crisis-response actions
are not implemented. **M9 (Technology and Education)** adds a validated 120-technology,
six-era acyclic tree; per-country research projects whose work comes only from
funded academic labour; technology effects on sector output, mortality, education
quality, building unlocks, and law enables; a cash-limited education/research
institution; and authoritative age-specific literacy updated by schooling and
shifted by ageing and migration. **E5 (Labor and Social Institutions)** adds a funded
vocational-training service with real academic instructors and a treasury-limited
trainee stipend, a new authoritative block qualification rate that drives actual
wages and labour productivity, a public-health service delivered by a share of the
existing administration clerk base with a derived mortality effect, and M8
minimum-wage, working-hours, and public-health laws. Pensions/social insurance,
collective bargaining, labour-market enforcement, cross-profession promotion, and
practitioner-level medical staffing remain deferred. General goods/services
procurement, private co-financing, loans, guarantees, investment tax credits,
public-enterprise expansion/discontinuation, consumption/excise, property/land, and
customs taxes, broader government expenditure and services, banking/central banking,
dynamic FX, inflation, monetary policy, reopen/reversal, diplomacy, and warfare remain
unimplemented. **M7's native
iOS/Android release
builds and real-device performance were not measured; M7 is delivered with that
explicit acceptance exception, not as a passed mobile release.** The designer has
adopted the M7a accounting stage (now implemented) and the planned inflation/FX/
monetary-policy foundations (M8a); M8a remains planned only (see
[the roadmap](#planned-development-roadmap-economic-management-overhaul-and-intermediate-finance-stages)).
The **Economic Management Overhaul (E0–E6)** is also adopted as the player-facing
economic program; **E0, E1, E2, E3, E4, and E5 are implemented in GDD v2.14 §17A/§17E,
M8 is implemented in §17C, and M9 is implemented in §17D**, and E6 is planned, not
implemented. The design
authority is the [Century GDD
v2.14](./Century_GDD_v2.14.md); v2.13 is retained as
[historical M9 documentation](./Century_GDD_v2.13.md), v2.12 as
[historical M8 documentation](./Century_GDD_v2.12.md), v2.11 as
[historical E4 documentation](./Century_GDD_v2.11.md), v2.10 as
[historical E3 documentation](./Century_GDD_v2.10.md), v2.9 as
[historical E2 documentation](./Century_GDD_v2.9.md), v2.8 as
[historical M7a/E1 documentation](./Century_GDD_v2.8.md), v2.7 as
[historical E1 documentation](./Century_GDD_v2.7.md), v2.6 as
[historical E0 documentation](./Century_GDD_v2.6.md), v2.5 as
[historical documentation](./Century_GDD_v2.5.md), v2.4 as
[earlier historical documentation](./Century_GDD_v2.4.md), and v2.3 as
[earlier historical documentation](./Century_GDD_v2.3.md). Persistent engineering
rules are in [`AGENTS.md`](./AGENTS.md), and implementation decisions are in
[`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world, population, demography, needs, wealth, M3a economy state/ledger, M3b employment, M3c production/inventory, M3d market clearing, M3e settlement, M3f integrated economic tick, M4a account/country model, M4b monthly period close, M4c government fiscal loop, M5 multi-market/migration/labor access, M5a profit allocation, M5b public debt/deficit financing, M6 country AI/action validation, E2 fiscal schedule/budget/business-tax/reserve/financing actions, E3 construction queue/idle-labor capitalization/state-owned completion, E4 sectors/material procurement/subsidies/public-enterprise support, M8 regimes/laws/elections/interest groups/unrest/institutions/events, M9 technology graph/research/education/age-specific literacy, E5 vocational training/qualification/public health/labor standards, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON static definitions (population, goods, professions, buildings, M3 scenario), calibration/source references, M5 historical pipeline and eight-polity sample (with M5a profit and M6 AI policies enabled), and validated loader | `@century/sim` |
| [`packages/sim-worker`](./packages/sim-worker) | Versioned M7 worker protocol, bounded immutable snapshots, simulation host, save-storage codec, and Node/Web/WebView entries | `@century/sim`, `fflate` |
| [`packages/app`](./packages/app) | M7 Expo/React Native playable shell: six screens, Web Worker/WebView transports, snapshot-only UI, compressed save/load | Expo, React Native, `@century/sim-worker` |
| [`packages/bench`](./packages/bench) | Headless M1–M7 benchmark harness, including the opt-in full-campaign mode and M7 worker-host benchmark | `@century/sim`, `@century/sim-worker`, `@century/data` |
| [`packages/tests`](./packages/tests) | Jest unit, integration, conservation, determinism, serialization, calibration, worker, and UI-boundary tests | `@century/sim`, `@century/sim-worker`, `@century/data` |

`packages/sim` compiles with `"lib": ["ES2022"]` and `"types": []`, has no
runtime dependencies, and imports only its own relative `.js` modules. It must
never import the app, data loader, benchmark, or platform code. Static
definitions live as JSON under `packages/data/data` and are passed explicitly
through `TickContext`; they are not serialized into `World`.

## Requirements and commands

- Node.js **22.12.0 or newer** (Expo 58 prints an unsupported-runtime warning below
  **22.13.0**; the M7 exports still completed on Node 22.12.0).
- pnpm **9.15.9**

| Command | Effect |
|---|---|
| `pnpm install` | Install the workspace reproducibly from `pnpm-lock.yaml`. |
| `pnpm run build` | Compile every package in dependency order and regenerate the app worker bundle. |
| `pnpm run lint` | Boundary checks: no ambient RNG, no forbidden APIs in `sim`, ES2022-only config, no runtime deps in `sim`. |
| `pnpm run typecheck` | Typecheck every package in strict mode, including the app and worker. |
| `pnpm test` | Run the Jest suite, including M7 worker/protocol/snapshot/save tests. |
| `pnpm run bench` | Build all benchmark cases (M1 through M7) and report timings, hashes, and invariant gates. |
| `pnpm run bench:campaign` | Opt-in M6 full 36,524-tick campaign benchmark with per-tick p50/p95/p99, AI counts, bounded-state checkpoints, and final save size. Long-running; part of `pnpm run ci` only indirectly through M6/M7 bounded benchmarks. |
| `pnpm -F @century/app web` | Start the Expo web development server. |
| `pnpm -F @century/app export:web` | Produce the static Expo web export. |
| `pnpm -F @century/app export:ios` / `export:android` | Produce iOS/Android Hermes JS bundles (not native release builds). |
| `pnpm run app:export` | Export web, iOS, and Android JS bundles; included in `pnpm run ci`. |
| `pnpm run ci` | Local CI path: lint, typecheck, test, benchmark, and web/iOS/Android app exports. |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
runs the same verification with a frozen lockfile.

## M1 semantics preserved

- Day index `0` is `1900-01-01`; index `36,524` is the terminal `2000-01-01`
  boundary. There are exactly 36,524 processed campaign days and 36,525 valid
  day indices.
- `World.dayIndex` is the next civil day to process. At the boundary, `tick`
  mutates nothing.
- `World.startDayIndex` is the first day represented by a scenario. Annual
  ageing is skipped on that starting January 1; the campaign default is day 0,
  while the WPP 1950 validation scenario starts on 1950-01-01.
- Gregorian leap years are explicit and tested. No host `Date`, time-zone, or
  wall-clock API is used.
- Randomness is keyed by `(seed, day, entityId, purpose, drawIndex)` with a
  documented two-lane purpose digest and known-answer vectors in
  [`docs/randomness.md`](./docs/randomness.md).
- Save envelopes are canonical JSON with a checksum; typed arrays are explicitly
  tagged and reconstructed. Invalid, corrupt, and incompatible saves fail with
  `SaveFormatError`.

## M2.1 population core

`World` contains a minimal region collection, population blocks, and a minimal
household-account subset of the future finance state.

### Single-year age and sex state

- Authoritative state is `PopBlock.maleByAge` and `PopBlock.femaleByAge`, each a
  `Uint32Array` of **81 slots**: single ages 0–79 plus one open-ended 80+ slot.
- The 17 five-year bands used by the GDD and historical sources are **derived on
  demand** (`fiveYearAgeGroups`, `maleFiveYearAgeGroups`,
  `femaleFiveYearAgeGroups`); they are not stored as duplicate authority.
- Scenario data stores male/female totals for the 17 five-year bands. Creation
  expands each finite band uniformly across five single-year ages and places the
  entire 80+ band at age 80. This within-band distribution is a documented
  assumption, not extra historical information.
- Working age is single ages 15–64 across both sexes.

### Exact annual ageing

- On January 1 (except the scenario's starting day), every person advances
  exactly one year.
- Ages are shifted oldest-to-youngest so an arrival is never moved twice in the
  same pass. Age 79 enters 80+; the 80+ group never ages out.
- Newborns are added to age 0 later in the day, after deaths.
- No one-fifth fractional transfers or aging carries remain. Population is
  conserved exactly across every pass.

### Age-specific fertility

- Seven maternal five-year bands: 15–19 through 45–49.
- Expected annual births are
  `sum(F_a × ASFR_a / 1000)` over female ages 15–49, with sex-specific female
  counts from `femaleByAge`.
- Daily expected births are divided by the actual civil-year length (365/366)
  and accumulated with per-block fractional remainders.
- Births enter age 0 in the generating pop block.
- Newborns are split by `PopulationDefinitions.sexRatioAtBirth`; male plus female
  births equals total births exactly. The current 1.05 male/female ratio is
  **provisional**, not an annual WPP series.
- ASFR, not crude birth rate, is authoritative.
- `fertilityMultipliers` remain a provisional profession-level modifier.

### Age-specific, sex-specific mortality

- Mortality is specified by 17 five-year bands separately for males and females,
  then applied uniformly to each single-year age in the band; the 80+ rate is
  applied to the open-ended 80+ aggregate.
- Annual rates are converted with the actual civil-year length and accumulated
  through one per-block death remainder.
- Deaths are allocated back to age/sex counts with deterministic integer
  apportionment and exact conservation. M2.1 uses a cumulative integer
  apportionment pass rather than the previous 17-band largest-remainder
  implementation; conservation and stable age-sex order are tested.
- Prior-day unmet subsistence/basic counters raise the mortality multiplier.
- Migration remains outside M2.

### Needs, budgets, and supply

- Four tiers: subsistence, basic, comfort, luxury; wealth-dependent activation.
- One physical supply pool per good is shared across all four tiers.
- The daily budget is based only on annual settled per-capita income net of
  mandatory payments, divided by the actual civil-year length and multiplied by
  block population. Savings accounts are authoritative but are not added to the
  budget and are not spent.
- `fundingRatio = clamp(tierCost > 0 ? budget / tierCost : 1, 0, 1)`.
- Only fulfilled quantities spend budget and consume supply; higher tiers are
  not purchased when a lower tier is unmet.
- Scarce supply is allocated deterministically across blocks with stable IDs.

### Wealth and militancy

- Wealth uses the GDD target formula and monthly smoothing.
- Basic-unmet loss and comfort/luxury gains are separate bounded adjustment
  terms; coefficients are provisional.
- Pop-block militancy updates daily after needs; regional/national political
  aggregates remain weekly M8 systems.
- Mortality is daily and uses the previous day's unmet counters.

## M3a economy foundation

M3a added the validated structural layer for the first economic slice. M3f now
integrates that economy into `tick()` for worlds with buildings and markets;
M2-only worlds continue to use the M2 needs-fixture path. M3b added the explicit
employment-refresh boundary.

### Catalog and units

- Eight goods: grain, livestock, fish, cotton, wool, textiles, clothing, and
  food-products. Services are deferred because their non-storable same-day path
  is not implemented.
- Eight building definitions: subsistence farm, commercial farm, ranch, fishery,
  food-processing plant, textile mill, workshop, and warehouse. The workshop
  consumes textiles and produces clothing.
- A TU is one standard recipe batch. Capacity is TU/day; recipe quantities are
  physical units/TU; staffing is workers per (TU/day).
- Regional resource-limited recipes are deferred. `resourceRequirements` must be
  empty and regional caps are not applied per building.
- Building instances are private, located in a region, and linked to an owner
  household account and an operating cash account.

### Inventory and ledger

- `Market.stockLots` is the sole authoritative inventory representation.
  `stockByGood` is derived on demand, never serialized, and excluded from the
  world hash. Lots are canonicalized by `(goodId, ownerBuildingId)`.
- M3 adds a minimal balanced cash ledger. For cash assets, a debit increases the
  balance and a credit decreases it; the receiving account is debited and the
  paying account is credited. Postings are atomic and reject overdrafts.
- M3a implements only the ledger primitive; wages, production, market clearing,
  and pricing are later phases.

### Validation

- Scenario validation rejects malformed definitions, broken references, duplicate
  ids/lots/accounts, invalid ranges, non-private instances, services, non-empty
  resource requirements, and initial stock above warehouse capacity.
- Population blocks below profession qualifications and buildings with no
  eligible workers are valid economic states, not structural data errors.
- Initial employment assignments are validated for profession match,
  qualification, participation, and job-slot limits.

## M3b employment assignment

M3b implements deterministic workforce evaluation behind an explicit refresh
boundary; it does not add an economic tick path.

- A block fills only its existing profession, subject to literacy/wealth
  qualification and `floor(workingAge × participationRate)`.
- Job slots are
  `floor(workersPerThroughputUnit × referenceThroughputPerDayAtLevelOne × level ×
  condition)`; fractional slots are not assignable.
- Valid existing assignments are retained in keyed order, partially if a slot or
  eligibility cap requires it. Remaining vacancies are filled by largest-remainder
  apportionment across eligible blocks, then across building vacancies, with
  keyed tie-breaking for equal remainders.
- `World.employmentDirty` triggers immediate evaluation; first-of-month evaluation
  uses the civil calendar. The terminal boundary is never refreshed.
- `createEconomyWorld` sets `employmentDirty = true`; the first
  `refreshEmploymentIfDue` call is the scenario initial evaluation.
- Employment totals and job-slot counts are derived from state; they are not
  stored as duplicate authoritative sums.

## M3c production and inventory movement

M3c adds an explicit physical production phase, not an economic tick. It does
not allocate scarce stock, settle purchases, pay wages, or update prices.

- Input reservations are transient, supplied explicitly, and refer only to
  opening lots. They identify buyer building, market, good, seller lot/building,
  and positive physical quantity. Total reservations per lot cannot exceed its
  opening quantity.
- Capacity uses the approved TU contract:
  `reference throughput × level × condition × staffing ratio × productivity`.
  Job slots and workers remain integers; goods quantities are continuous.
- Executed throughput is limited by capacity and every reserved required input.
  Only the inputs required for the executed throughput are consumed. Unused
  reservations remain in their original seller lots without payment or ownership
  transfer.
- Outputs are fixed-proportion products credited to the producing building's
  lot. A warehouse has no recipe, posts no input demand, and produces nothing.
- Storage capacity is derived from operational storage buildings using
  `quantity × level × condition` (provisional M3c rule). Post-production overflow
  is recorded as a proportional loss across affected lots and attributed to each
  owner; goods are never silently deleted.
- Conservation identity:
  `closing = opening + production - used inputs - recorded losses`, with imports
  and exports explicitly zero. Aggregate stock remains derived from lots.
- Production does not mutate accounts, employment, or prices. Reservations are
  never serialized, and no save may occur mid-phase.

## M3d market clearing and price updates

M3d adds `runMarketDay`, an explicit market-day phase. It is not a complete
economic tick: it neither computes household budgets nor settles money.

- Demand arrives as explicit records with desired and funded quantities.
  `fundedQuantity` is supplied by the caller; M3f will derive it from settled
  cash. M3d only allocates funded demand and returns pending transactions.
- Priority order is household subsistence (1), critical production inputs (2),
  household basic (3), remaining production inputs (5), household
  comfort/luxury (6). Government and export demand are absent.
- Critical inputs are identified from the building definition: essential
  infrastructure or a producer of subsistence/basic goods gets tier 2; other
  production inputs get tier 5. Numeric building IDs do not affect priority.
- Within a tier and good, supply is proportional when short. A partially
  unfilled funded tier blocks lower tiers for that good. Unfunded demand does
  not block lower funded demand.
- Households can buy a higher tier only when all of their active lower-tier
  desired quantities are fulfilled. All goods in a tier are resolved before the
  next tier is enabled; Pass B does not unlock new tiers.
- Pass A reserves opening inventory for household and input demand together.
  Production receives only accepted input reservations, uses only actual inputs,
  and releases the remainder. Pass B resolves remaining household demand against
  current stock after production—already including same-day output and net of
  actual input use—excluding all outstanding household reservations. If critical
  or remaining input demand could not be served, the corresponding lower household
  tiers stay blocked in Pass B because production inputs cannot be reopened.
- Final household quantities are removed exactly once, then final overflow is
  applied. Reserved or fulfilled household goods cannot be lost to overflow.
- M3c production normally applies overflow immediately. M3d uses the
  backward-compatible `applyOverflow: false` option and applies the shared final
  overflow helper after Pass B.
- Prices use provisional, uncalibrated coefficients:
  `imbalance = (funded demand - sellable supply) / max(funded, supply, 1e-9)`,
  `dailyChange = clamp(0.10 * imbalance, -0.05, +0.05)`, and
  `newPrice = clamp(oldPrice * (1 + dailyChange), 0.25*base, 4*base)`.
  Funded demand counts eligible household and production demand once; sellable
  supply is opening stock plus same-day production once. Input demand is not
  netted from supply, and final overflow losses are excluded from today's price.
- Same-day allocations and pending transactions use the day's opening price. The
  updated price applies to the next day. Prices remain finite and positive.
- Reservations, demand allocations, production results, and pending transactions
  are transient. No financial balance, wage, or settlement state is changed.

## M3e cash settlement, wages, and retained profit

M3e adds `settleMarketDay`, an explicit settlement phase that consumes one M3d
result and mutates authoritative `World.finance` balances. It does not add a
daily economic tick.

- Each M3d seller-attributed household/input transaction is posted exactly once
  at its established quantity and price. Seller building operating accounts are
  credited; buyer household or operating accounts are debited.
- Market transactions settle as one atomic batch. Same-batch sales receipts may
  fund a building's purchases; every account must end non-negative. Insufficient
  market funds reject the entire market batch with no balance or posting changes.
  Market purchases are never partially settled and create no debt.
- Wages use actual employment assignments, not building capacity. Daily wages are
  `baseWage1900SUSDPerYear / daysInYear(civil year)`. Unfilled slots are unpaid,
  and no worker is paid twice.
- Wages are paid after market settlement from the employer operating account. If
  an employer is short, workers receive a deterministic pro-rata payment and the
  unpaid remainder is reported. No negative balance, debt, or liability is
  created.
- Every operational building also pays daily upkeep of
  `dailyUpkeepSUSDAtLevelOne × level` from its operating account to the single
  system-reserve account. Upkeep is paid after wages. Condition and staffing do
  not scale upkeep because the data/GDD define only the level-one daily value.
  Underfunded upkeep is partially paid and the shortfall is reported; no debt,
  negative balance, or automatic closure is created. The system reserve is a real
  account, so upkeep is a transfer, not money destruction.
- Producer cash-basis profit is
  `revenue - input costs - wages paid - upkeep paid`. Input consumption is a
  monetary cost once, through its settled purchase, not again through inventory.
  Profit is retained in the operating account; no dividend or owner distribution
  is implemented.
- Household accounts change only through settled purchases and wage receipts.
  `wealthLevel` remains a welfare indicator, not cash.
- SUSD amounts are not rounded per transaction, worker, or upkeep obligation; the
  existing `1e-6` monetary tolerance is used for invariants. Postings balance and
  total cash is conserved.
- `MarketDayResult.settled` is a transient duplicate guard for the same result
  object; it is not serialized. A deep copy can bypass it, and no persistent
  settlement ledger is introduced.
- No schema, save-format, data-version, or simulation-version change is made.
- Wage index/scarcity/inflation/laws, taxes, interest, debt, and dividends remain
  deferred.

## M3f integrated economic day

M3f turns the public `tick()` into a complete daily economic path for worlds with
buildings and markets. M2-only worlds continue to use their existing needs fixture
path.

### Daily order

1. Validate world, terminal boundary, and context.
2. Stage the complete world with the structural clone.
3. Annual ageing when due (January 1, except the scenario start day).
4. Daily births/deaths.
5. Reconcile/refresh employment when dirty, monthly, or invalidated by
   demographic change.
6. Build household and production demand from real state.
7. Run M3d market clearing, production, Pass B, prices, and final overflow.
8. Run M3e market, wage, and upkeep settlement.
9. Update needs counters, daily militancy, and monthly wealth when due.
10. Advance `dayIndex` exactly once and publish the staged world.

### Household demand and funding

- Needs come from `PopulationDefinitions.needs`, population, wealth activation,
  and current market prices.
- Desired physical demand is `quantityPerCapitaPerDay × population`.
- The household's opening account cash is the only budget. Same-day wages are
  not available for the earlier market phase.
- Tiers are funded in GDD order. If cash cannot fully fund the current tier, that
  tier is proportionally funded and no higher tier is generated. Funded cost is
  capped below available cash by the existing `1e-6` money tolerance.
- Multiple goods and tiers are evaluated together, so individually affordable
  requests cannot overdraw the household in aggregate.

### Production demand and cash safety

- Desired input demand is derived from current building capacity and recipes.
- The day first tries full desired production demand, allowing valid same-batch
  sales receipts to fund input purchases through M3e's atomic market batch.
- If that settlement fails, the staged post-population state is restored and
  production demand is regenerated with each building's input cost capped by its
  opening operating cash. This conservative fallback is safe and is reported as
  `fallbackUsed`.
- Actual sales that do not materialize cannot leave a negative buyer account.

### Whole-day atomicity

The complete day runs on a structural deep clone of the current schema. Every
typed array, region, pop block, building, employment assignment, market stock lot,
price array, finance account, journal posting/line, and diagnostics buffer is
copied. Population, employment, inventory, prices, finance, postings, needs
indicators, and the calendar mutate only the clone. The caller's world is updated
only after every phase and final validation succeeds. A failure leaves the
original world, hash, and serialized representation unchanged. The clone helper
must be extended whenever authoritative state gains a field; a serialization
equality and no-shared-reference test guards the current schema.

### Needs and wealth

- Household need fulfillment and actual purchase spending are converted into the
  existing needs summaries; unmet subsistence/basic/comfort counters and daily
  militancy come from actual market outcomes.
- Monthly wealth is re-estimated on the last civil day of each month using GDD
  §6.5. Per-capita income is the current day's actual settled household wage
  receipt annualized by the civil year; current post-market prices define the
  subsistence basket; mandatory payments are zero because M3f has no taxes.
  Household cash is not treated as income. The update runs after needs counters
  and daily militancy, before any subsequent January 1 ageing.
- The GDD does not define a monthly income measurement window; this convention is
  documented in `DECISIONS.md`. No persistent monthly-income accumulator or save
  field is introduced. A later milestone may refine the income window.

No schema, save-format, data-version, or simulation-version change was introduced
by M3f.

## M4a-1 account model and double-entry conversion

M4a-1 converts the M3 cash-only ledger into a category-aware double-entry ledger
without changing any M3 cash outcome. Country/currency identity, taxes, period
closing, distributions, debt, and inflation remain later milestones.

- Accounts carry a `category` (`asset`, `liability`, `equity`, `revenue`,
  `expense`) and a validated functional `subtype` (for example `household-cash`,
  `sales-revenue`, `input-expense`). Balances are stored in **normal-side units**:
  asset and expense accounts are debit-normal; liability, equity, and revenue
  accounts are credit-normal.
- Every owner receives a structural account set: each pop block has cash, equity,
  wage income, and consumption expense; each building has operating cash, equity,
  sales revenue, input expense, wage expense, and upkeep expense; the system
  reserve has cash, equity, and system income.
- Market sales, wages, and upkeep now post recognition legs as well as the cash
  legs. Cash totals, producer cash-basis profit, household cash, and all
  settlement totals are unchanged; only the journal representation is richer.
- Input purchases are expensed when purchased. **Inventory is deliberately not an
  accounting asset in M4**; this is a provisional cash-basis simplification, not
  full accrual accounting (no COGS or inventory valuation).
- Opening balances are applied **once, atomically**, with explicit equity
  counterparts, a persisted `OpeningBalanceRecord` (day, account count, canonical
  checksum), and an idempotency guard. They are the initial condition, so they do
  not create one journal posting per account. A second application is rejected.
- `FinanceState` adds `nextAccountId` for deterministic account allocation and
  `opening` for the provenance record. Derived account ids are allocated above
  every scenario-declared account id.

### Invariants

- **I-1 accounting identity:** every posting balances, and
  `assets + expenses = liabilities + equity + revenues` holds after every entry
  and at day boundaries. The identity is never tested per line.
- **I-2 aggregate designated-cash conservation:** the explicit `CASH` set is
  `household-cash`, `operating-cash`, and `system-reserve-cash` — never "every
  asset account". Ordinary (cash-neutral) transaction kinds must not change the
  aggregate. `monetary-issuance` and `monetary-redemption` are the only registered
  cash-changing kinds; they are not implemented in M4a-1 and posting them is
  rejected.
- **I-3 total assets are not conserved:** a future bond issuance can create an
  asset against a liability without moving cash. The tests keep this distinct
  from I-2.
- **I-4 issuance counterpart contract:** the cash-changing kinds are registered so
  later stages can implement and test their explicit counterparts. No central
  bank, debt, or monetary issuance exists in M4a-1.

### Performance

`FinanceIndex` is a transient lookup built once per phase and never serialized.
This removes repeated linear account scans from demand construction and
settlement; the M3f economic-day benchmark remains the relevant Node diagnostic.

## M4a-2 country and currency identity

M4a-2 adds the minimum country, currency-issuer, monetary-arrangement, and
SUSD-relative valuation model needed by later finance stages. It does not add
dynamic FX, monetary policy, issuance, central banks, treasury accounts, native
balances, inflation, or trade settlement.

### SUSD measurement rule

SUSD is Century's fixed unit of measurement. The unit's definition does not
change; the SUSD-denominated value of currencies, goods, wages, and assets can
change. SUSD is not a registered currency, an issuer, a legal tender, or a
promise of constant purchasing power. Nominal SUSD is distinct from any future
real/inflation-adjusted measure.

### Authoritative state

`World.countries`, `World.currencies`, and `World.currencyValuations` are
authoritative runtime state. They are serialized, hashed, validated, and
structurally cloned. Legacy M2/M3/M4a-1 worlds carry empty collections and remain
valid.

```ts
Country  { id, tag, name, monetary, regionIds }
Currency { id, key, name, issuer }
CurrencyValuation =
  | { currencyId, status: "specified", susdPerUnit, setOnDay, source: "scenario" }
  | { currencyId, status: "unavailable" }
```

- `Country.monetary` is the sole domestic arrangement; there is no duplicate
  `Country.currencyId`.
- `SusdPerCurrencyUnit` is a branded numeric type with a validated constructor;
  serialized state remains a plain number.
- `Country.regionIds` is the sole country-to-region ownership authority.
  Unassigned regions are allowed; `regionOwner` returns the owner, `null` for a
  known unassigned region, and throws for an unknown region.

### Issuance and arrangement

Issuance is independent of the domestic arrangement:

- `own` selects a currency issued by that country.
- `adopted` selects a currency issued by another simulated country or a foreign
  issuer. Adoption never makes the adopter an issuer.
- A country may issue one currency and adopt a different currency for domestic
  use; its issued currency may be adopted by another country or remain unused.
- Each simulated country may issue at most one currency in M4a-2 (deliberate
  scope restriction).
- A foreign-issued currency must be adopted by at least one country.
- Every currency has exactly one issuer and exactly one valuation record.
- Shared-currency arrangements and union issuers are rejected.
- Currency keys are unique lower-case identifiers; `susd` is reserved in any
  casing.

### Valuation and conversion

`CurrencyValuation.susdPerUnit` is the SUSD value of one unit of the currency.
Cross rates are derived and never stored:

```
crossRate(from, to) = from.susdPerUnit / to.susdPerUnit
// units of `to` per one unit of `from`
```

At 0.25 SUSD/A and 2.00 SUSD/B, A→B is 0.125 and B→A is 8. Conversions validate
finite non-negative amounts, finite positive rates in `[1e-12, 1e12]`, and
finite results; overflow and positive underflow are rejected. Missing or
unavailable valuations raise `CurrencyValuationError`; they never default to
parity. Rate comparisons use a dimensionless relative tolerance; SUSD amounts
use the existing money tolerance. Bounds and tolerances are provisional
numerical safety choices, not calibration.

### Persistence

**Historical M4a-2 milestone record.** The values below describe the M4a-2
milestone; the current M4c build uses schema `9` and simulation version `0.9.0`
(see the M4c section below).

- `WORLD_SCHEMA_VERSION = 7`; `SIM_VERSION = "0.7.0"`; save format `1`; data
  version `m3-economy-v1` unchanged (no shipped scenario data changed).
- Schema-6 / simulation-0.6.0 saves are rejected with an actionable error; no
  migration is implemented.
- New digests: empty world `31d491d18d02a4af`, M2 campaign aggregate
  `7961a6dd7da17bb3`, WPP validation `67cd0a5d67765bf7`, M3 structural world
  `39a732ddd3dcd3c3`.
- M4a-2 uses inline test fixtures; no synthetic country, currency, or rate data
  is added to shipped scenarios.

GDD v2.12 is the current design authority. At the time of this M4a-2 section, v2.5
recorded the M4c government fiscal loop (D-048) alongside the M4b close (D-047), the
M4a-2 model (D-044/D-045), M5 (D-051–D-055), M5a (D-056), and M5b (D-057). GDD v2.12
records M7a annual accounting (§17B), the Economic Management Overhaul (§17A; E0
design, E1/E2/E3/E4 implementations), and M8 laws and institutions (§17C; D-076);
E5–E6 are planned, and M8a remains planned only.
See the roadmap below.
GDD v2.4 is preserved as [historical documentation](./Century_GDD_v2.4.md), GDD
v2.3 remains available as [earlier historical documentation](./Century_GDD_v2.3.md),
and GDD v2.2's `CurrencyState`/`fxToUSD` target is superseded and is not current
authoritative state.

## M4b monthly finance close

M4b adds a monthly period close for economic worlds and immutable monthly finance
summaries. It does not add taxes, government finance, debt, interest, banking,
monetary issuance, native-currency balances, FX, inflation, annual close,
reopen/reversal, or UI.

### Timing and boundaries

- An economic world closes on the last civil day of each Gregorian month, after
  that day's postings, needs/militancy update, and month-end wealth update, and
  before `dayIndex` advances. M2-only worlds never close.
- Period bounds are inclusive. The first period starts at `World.startDayIndex`
  and may be partial; later periods start the day after the previous end, and
  every end is a civil month-end.
- Duplicate, out-of-order, and gapped closes are rejected. The terminal
  `2000-01-01` boundary is never closed; the last possible period ends
  `1999-12-31`.
- Published-state validation cannot prove which days a caller processed before the
  first close. The accepted convention allows the first close at any civil
  month-end on or after `startDayIndex`, and contiguity is checked between recorded
  summaries only. This is documented as a limitation, not a completeness
  guarantee.

### Summaries and flows

```ts
FinancePeriodSummary { periodStartDay, periodEndDay, accountTotals, flowTotalsByKind }
```

- `accountTotals` is the pre-close trial balance: only nonzero accounts, including
  opening balance-sheet balances and the period's revenue/expense.
- `flowTotalsByKind` always carries the four gross flows: `goods-purchase` from
  `consumption-expense`, `input-purchase` from `input-expense`, `wages` from
  `wage-expense`, and `upkeep` from `upkeep-expense`. `period-close` is not a flow
  kind, and there is no separate flow accumulator.
- Opening revenue and expense balances are rejected; those accounts start at zero,
  so each expense balance measures exactly one period's gross activity. Opening
  balance-sheet balances are never treated as period flows.

### Closing entries and invariants

- A central semantic matrix fixes the revenue/expense lines for each transaction
  kind and is enforced for individual, batched, and persisted postings.
  `profit-distribution` and `owner-capital-injection` may not post to revenue or
  expense accounts.
- `period-close` is internal: public posting APIs reject it at type and runtime
  boundaries, while persisted close entries are structurally validated.
- For each owner, revenue is debited, expense is credited, and the net
  `revenue - expense` posts to the owner's existing `owner-equity` in
  deterministic owner/account order. Equity may be signed; a zero net needs no
  equity line.
- Every owner with revenue/expense accounts must have exactly one `owner-equity`
  account (the system owner independently of reserve-account existence). A missing
  account fails before mutation.
- Closing entries are cash-neutral, zero revenue/expense exactly, and preserve the
  accounting identity. The close copies the finance state, applies and validates
  the change on the copy, and only then replaces `world.finance`.

### Persistence and staged state

- `FinanceState` gains `periodSummaries` and `closedThroughDay`.
- A staged close may temporarily have `closedThroughDay === world.dayIndex`; a
  published or serializable world requires `closedThroughDay === null ||
  closedThroughDay < world.dayIndex`. World validation, serialization, hashing, and
  deserialization enforce the published rule; `tick` advances the day before
  publishing.
- Summaries are encoded sorted by period end with canonical account/flow keys,
  included in hashing and deep cloning, and validated on decode.
- `WORLD_SCHEMA_VERSION = 9`; `SIM_VERSION = "0.9.0"`; save format `1`; data
  version `m3-economy-v1` unchanged. Schema-8 / simulation-0.8.0 saves are
  rejected with no migration.
- Current digests: empty world `eead21fcf318a512`, M2 campaign aggregate
  `5054423ef7e03e1c`, WPP validation `211784dc6b6627a6`, M3 structural world
  `302cf66cd1dbb692`. Digests were re-baselined because schema/simulation
  versions are hashed; countryless worlds keep their original owner account set.
- `FinanceState.periodSummaries` is the long-run monthly finance history; the
  bounded `postings` buffer remains an audit ring, and no `World.history`
  collection is added.

## M4c government fiscal loop

M4c adds a per-country treasury, a daily flat income tax on wages actually paid,
and a daily budgeted per-capita welfare transfer. It does not add corporate,
consumption, land, or tariff taxes; broader government services, procurement, or
employment; debt, bonds, interest, or deficit financing; banks, issuance, FX,
inflation, or monetary regimes; law-bounded rates, elections, or interest groups;
player/AI policy actions; UI; GDP/national accounts; annual history; or annual
close/reopen/reversal.

### Accounts and state

- Every country owns `treasury-cash` (designated cash), `income-tax-revenue`,
  `welfare-expense`, and `owner-equity`. The treasury id is scenario-declared;
  the other accounts are deterministically allocated above the declared-id floor.
  Opening treasury cash is applied once through the existing opening-balance
  provenance record, with country equity as its counterpart.
- Every pop block in a world that declares at least one country owns
  `income-tax-expense` and `welfare-income` in addition to its existing cash,
  equity, wage-income, and consumption-expense accounts. Countryless M2/M3
  fixtures keep their original account set and have no fiscal system; validation
  requires the fiscal accounts whenever a country exists.
- `Country.treasuryAccountId` and `Country.fiscal`
  (`incomeTaxRate` 0..1, `welfareBudgetSUSDPerYear` finite and nonnegative) are
  authoritative state. Fiscal policy is provisional scenario-initialised state,
  not law-bounded and not mutable by an action in M4c.

### Daily fiscal phase

The fiscal phase runs inside the integrated economic day after market, wage, and
upkeep settlement and before needs/militancy and month-end wealth. The M4b close
timing is unchanged.

- **Income tax:** `tax = incomeTaxRate × wages actually received that day` per
  pop block, residence-based. Graded wage income and employer wage expense are
  unchanged; there is no tax on welfare or wealth, no exemptions or strata, and
  collection efficiency is fixed at 1.0. Partial wages produce partial tax;
  multiple employers are combined by settlement. Tax cannot exceed received
  wages or household cash.
- **Welfare:** `requested = welfareBudgetSUSDPerYear / daysInYear(current civil
  year)`. Payable is the lesser of requested and treasury cash after same-day
  tax; it is allocated across the country's pop blocks in proportion to
  population with an exact deterministic remainder. Insufficient treasury cash
  reduces all transfers proportionally, records the shortfall, and creates no
  debt, arrears, or negative cash. Zero budget or zero population creates no
  posting.
- All fiscal entries are built and applied to an isolated finance clone; the
  complete staged world and treasury reconciliation are validated before the
  clone replaces `world.finance`. A failure leaves the original accounts,
  postings, posting ids, summaries, close boundary, and settlement consumption
  state unchanged. The fiscal phase is internal to `runEconomicDay` and is not
  re-exported from the package root.
- Execution guards reject a wrong world/day, the terminal boundary, a settlement
  from another seed/scenario/start day/market, a stale posting boundary, a reused
  settlement, and invalid world/treasury state before any staging.
- The transient fiscal result reports per-country income tax, requested/paid
  welfare, shortfall, start/end treasury cash, and per-block tax/welfare plus
  `endingCashAfterFiscalSUSD`, read from the authoritative staged account. No
  redundant fiscal counters are persisted.

### Accounting, close, and wealth

- `income-tax` and `welfare-transfer` are registered cash-neutral transaction
  kinds and are enforced by the central semantic matrix for single, batched, and
  persisted postings. Their structural validator additionally requires the
  complete recognition and cash legs with matching per-block and country totals;
  cash-only or incomplete fiscal entries are rejected. `treasury-cash` is part of
  the designated-cash set, so the aggregate cash invariant still holds.
- Country tax revenue and welfare expense close into country `owner-equity` at
  the same month-end as other owners. Close order is pop blocks, buildings,
  countries, then the system owner. The `FinancePeriodSummary` shape and the
  four `flowTotalsByKind` keys are unchanged.
  `governmentPeriodTotals(finance, summary)` derives per-country income-tax
  revenue, welfare expense, and net fiscal result from the frozen `accountTotals`
  plus account metadata without storing redundant totals.
- Transient cash fields are phase-qualified: settlement reports
  `endingCashAfterSettlementSUSD` (before fiscal), needs reports
  `budgetStartBeforeNeedsSUSD` / `budgetEndAfterNeedsSUSD` (before/after needs
  spending), and fiscal blocks report `endingCashAfterFiscalSUSD`. The
  authoritative account ledger is final end-of-day cash.
- SUSD uses continuous floating-point arithmetic in a fixed deterministic order;
  there is no cent quantization. `MONEY_TOLERANCE_SUSD = 1e-6` is an invariant
  tolerance, not a rounding operation. D-049 records the precision policy,
  residual allocation rule, and phase-qualified result semantics.
- The month-end wealth update refines the provisional M3f convention:
  `perCapitaIncome` is actual wages plus welfare received that day, and
  mandatory payments are income tax actually withheld, both annualized by the
  civil year. This is still a current-day flow annualization, not a trailing-month
  average.
- Schema 9, simulation 0.9.0, save format 1, data version `m3-economy-v1`
  unchanged. Schema-8/0.8.0 saves are rejected; no migration is implemented.

### M4c limitations

- Collection efficiency is fixed at 1.0; there is no bureaucracy, institution, or
  administrative-service model yet.
- Tax is a single flat wage-only residence-based rate with no exemptions,
  strata, or law bounds; corporate, consumption, land, and tariff taxes are
  absent.
- Welfare is one budgeted per-capita transfer, not a service, targeted benefit,
  or administrative programme; a shortfall is unfunded rather than a liability.
- Government procurement (market tier 4), government employment, services,
  subsidies, infrastructure, and debt service are absent.
- Fiscal policy cannot be changed by a player/AI action yet; M6/M7 supply the
  action interface and M8 the taxation law that may bound rates.
- The fiscal phase's test-only post-staging hook is deliberately not exported
  from the package root; it exists only for publication-atomicity regression
  tests.
- Monetary precision is continuous floating point; cross-engine bit identity is
  not claimed beyond the existing documented limitation.
- Node benchmarks remain diagnostics; the mobile p95 target is **NOT
  EVALUATED**.

## M5 multi-region, multi-country, migration, labor mobility, and historical data

M5 turns the single-region/single-market economic world into a validated
multi-country campaign foundation. It is implemented end to end: eight authored
1900 polities construct, validate, serialize, save/resume, and run together.

### Geography and markets

- `Country.regionIds` remains the sole authoritative region-ownership mapping and
  `Market.regionIds` is the authoritative market membership. `Region.marketId` is
  validated against it. A region belongs to exactly one market; a country's
  regions must belong to one market in M5. Countryless multi-region fixtures are
  valid and use an unrestricted countryless area.
- Every market is cleared exactly once per day in ascending market-id order.
  Production, input reservations, storage capacity, overflow, prices, and
  inventory conservation are market-scoped. Shared-market regions pool inventory
  once, so three regions in one market do not triple goods or demand.
- Household and production demand is built from opening cash for the buyer's own
  market. Settlement merges all markets' transactions into one atomic posting
  batch and pays wages/upkeep once per day. Existing single-market M2/M3/M4
  fixtures keep their previous behavior.
- Shared markets are the M5 trade connection: countries whose regions share a
  market transact across borders through ordinary goods purchases. M5 does not
  implement inter-market physical trade, tariffs, cross-market transport charges,
  or a rest-of-world trade account; GDD v2.6 §17A.8 now specifies the intended trade
  framework and prerequisites, but they remain unimplemented (D-051/D-070), not
  placeholder behavior.
- Buildings and their owning household must belong to the same country. A
  building's owner account must be a pop-block household-cash account.

### Migration

- Runs on the first civil day of a month, never on the start day or terminal
  boundary, after the initial labor allocation.
- Moves an integer number of people between two existing blocks with the same
  profession in different regions. The source's single-year sex/age cells are
  split proportionally with deterministic largest-remainder allocation; world
  population is conserved exactly. Each migrant's pro-rata share of household cash
  moves through a balanced `migration-transfer` posting.
- Destination literacy/wealth/militancy are population-weighted merges; the
  destination block keeps its needs-history counters; fractional birth/death
  remainders stay with their original blocks.
- Pressure is `0.7 × max(0, destination vacancy rate − source vacancy rate) +
  0.3 × max(0, wealth gap/100)`; monthly migrant fraction is
  `min(1%, pressure × 1%)`. A destination region may absorb at most 1% of its
  start-of-month population in one month. These coefficients are provisional.
- Domestic migration is always allowed. Cross-country migration requires the
  destination country's `immigrationOpen` policy flag (scenario-initialised
  provisional state). Emigration is unrestricted in M5. The GDD's open-border law
  is not implemented until M8; the flag is the explicit substitute.
- No migration block is created, no free migration pool exists, and no fixed
  population increment is applied.

### Labor mobility

- Residents may take jobs in any region of their own country. Employment is
  allocated domestic-first; a country's own residents fill its vacancies before
  foreign residents are considered. Foreign residents may fill remaining
  vacancies only in a destination country whose `immigrationOpen` flag is true.
- Qualification, participation, job-slot, and eligible-workforce caps are
  unchanged. A migration event marks employment dirty and triggers an immediate
  deterministic repair/reassignment in the same day.
- Cross-border wages are paid to the resident household and taxed by the
  household's residence country, preserving M4c fiscal ownership. No person is
  counted twice and no workforce is created.

### Historical data pipeline

- Compact, source-annotated tables live under `packages/data/data/historical/`:
  eight countries, 16 regions, 5 markets, 64 population blocks, 81 building
  instances, 8 currencies, an empty initial employment table, calibration targets,
  and `source_notes.md`.
- `packages/data/src/historical.ts` validates ids, references, ownership/market
  membership, population/employment/building ranges, currencies, fiscal values,
  source metadata, and calibration metadata; errors are deterministic and sorted.
  It expands block totals to five-year age/sex inputs with a documented
  provisional age profile and emits an `EconomyScenarioDef`.
- The sample spans industrialized, agrarian, resource-rich, and dependent
  conditions: United States, United Kingdom, German Empire, France, Russian
  Empire, Empire of Japan, British India, and Brazil. Three markets span multiple
  countries. The sample is roughly 648M people and is **not** a world total.
- Population targets are rounded source-referenced national estimates with
  declared tolerances; occupation targets are explicitly **provisional** broad
  ranges for a household-composition proxy, not the GDD employed-worker metric.
  Currency valuations are `unavailable`; no FX rates are invented. Age structure
  is one shared provisional 1900 profile, not country-specific.
- M5 does not implement profession promotion/demotion, so century-scale
  occupation-trend claims are not made. The M3 production/needs parameters are not
  historically calibrated; the sample is a structural and invariant test world,
  not a historical welfare reconstruction.

### Persistence, versions, and numerical robustness

- Schema **12**, simulation **0.12.0**, save format 1, data version
  `m3-economy-v1`. `Country.immigrationOpen`, `World.profitDistribution`,
  `Country.debt`, and `FinanceState.debtContracts/nextContractId` are the persisted
  additions. Schema-11/simulation-0.11.0 saves are rejected; no migration
  is attempted.
- `dataVersion` stays `m3-economy-v1` because M5/M5a/M5b add scenario content and
  scenario-provided policies without changing any existing definition or scenario
  meaning (D-053/D-056/D-057).
- Quantity conservation scales its comparison tolerance by gross physical terms
  so large nearly-cancelling flows do not create false failures. Wage
  affordability reduces a payment by at least one representable ulp when
  proportional allocation exceeds employer cash by rounding; the difference is
  reported as unpaid wages. No cent quantization or cash creation is introduced
  (D-054).
- M5b adds public debt but not banking, deposit money, a central bank, bond-market
  pricing, monetary issuance, FX dynamics, inflation, or new tax categories.

### M5 limitations

- No inter-market physical trade, tariffs, transport costs between markets, or
  rest-of-world trade counterparty.
- No profession promotion/demotion, education, or technology effects (later
  milestones).
- Migration is between existing same-profession blocks; a region without a
  destination block cannot receive that profession.
- Open-border policy is a scenario flag, not an enacted law; M8 may replace it.
- Historical calibration is partial: population baselines and authored occupation
  structure are checked; century-scale population/occupation trends are **not**
  claimed. Age structure, regional splits, literacy/wealth, fiscal settings,
  building levels, and market groupings are provisional.
- Node benchmarks are diagnostics; mobile performance remains **NOT EVALUATED**.

## M5a profit distribution and state-enterprise remittances

M5a adds retained-profit accounting and explicit profit allocation on top of M5.
It does not change M4b close semantics or M4c fiscal behavior.

- **Policy and ownership.** `World.profitDistribution` is persisted,
  scenario-initialised policy: `enabled`, `privatePayoutRate` (default 0.5), and
  `stateRemittanceRate` (default 1.0), each in 0..1. Legacy M0–M5 fixtures default
  it off; the M5 historical campaign enables it. A building may be private (owned
  by a pop-block household cash account) or state (owned by the owning country's
  treasury cash account, with the same country owning the building's region).
- **Retained profit.** Enabled worlds give every building a `retained-profit`
  equity account. At each month-end, after the M4b close, each building's frozen
  period net result (`sales − inputs − wages − upkeep`) is reclassified from owner
  equity to retained profit; losses become negative retained profit.
- **Allocation.** A building distributes `rate × positive retained profit`, capped
  by post-close operating cash. Private owners receive cash/equity in their
  household; state enterprises remit to treasury cash and country equity using
  `state-enterprise-remittance`. The remainder stays retained; a cash-capped
  shortfall is retained, never deferred or recorded as a liability. No distribution
  occurs while retained profit is non-positive.
- **Accounting and guards.** `profit-retention`, `profit-distribution`, and
  `state-enterprise-remittance` are cash-neutral overall, have no revenue/expense
  legs, add no M4b flow kind, and are structurally validated. The phase stages on a
  finance clone, re-validates accounts/postings/summaries/identity/cash, rejects a
  reused close result, and leaves the published world unchanged on failure.
- **Versions.** Schema **12**, simulation **0.12.0**, save format 1, data version
  `m3-economy-v1`; schema-11/0.11.0 saves reject with no migration.
- **Not included.** Corporate/dividend/capital-gains taxes, securities markets,
  share issuance/trading, banking, debt, deficit financing, arbitrary player/AI
  distribution controls, or the separate M5b debt system. State remittances are not income-tax
  revenue and do not enter `governmentPeriodTotals`.

## M5b public debt and deficit financing

M5b adds versioned public-debt contracts and a deterministic debt-service phase on
top of M5a. It is a public-finance system, not a banking or monetary system.

- **Issuer and holders.** A country issues SUSD debt to an explicitly identified
  simulated creditor: another country treasury or a pop-block household cash
  account. The issuer cannot hold its own debt. No bank, central bank, external
  investor pool, or bond market exists.
- **Policy.** Each country has a scenario-initialised `debt` policy: enabled,
  designated creditor kind/id, annual coupon rate, term in civil days, maximum
  outstanding principal, refinance-on-maturity, and arrears grace days. Legacy
  fixtures default it off. The shipped eight-polity scenario enables it only for
  the USA player country (GBR creditor, 4% coupon, 365-day term, 1,000,000 ceiling,
  refinance on maturity, 365-day grace) with a provisional 2,000,000 SUSD/year
  welfare budget and 100,000 opening treasury. Rates, terms, ceilings, and the
  scenario activation are provisional, not calibrated or player/AI controls.
- **Contracts and bounds.** Active/arrears contracts persist in
  `FinanceState.debtContracts` with contract version, issuer, holder, original and
  outstanding principal, coupon, issue day, maturity, accrued interest, status
  (`active`, `arrears`, `repaid`, `defaulted`), and arrears start day. Up to 64
  active contracts are allowed; the newest 32 terminated contracts are retained.
  Older terminated records are compacted into exact per-issuer `debtHistory`
  aggregates (counts, issued/repaid/written-off principal, written-off interest).
  `nextContractId` remains deterministic.
- **Accounting.** Issuance debits issuer treasury cash and credits debt liability,
  and debits holder bond asset and credits holder cash. Interest accrues daily as
  issuer interest expense/interest payable and holder interest receivable/income.
  Coupon payment reduces interest payable/cash and holder cash/receivable. Principal
  repayment reduces debt liability/cash and holder cash/bond asset. Default writes
  the remaining liability and interest off against owner equity on both sides.
  Borrowing is not revenue, principal repayment is not expense, and none of these
  kinds enters the M4b four-flow summary.
- **Timing and financing.** After the daily fiscal phase, the debt phase accrues one
  day of interest (actual-day/365 or /366). At each month-end it computes a
  **financing requirement**
  `max(0, welfareRequestedThisMonth + interestExpense − incomeTaxRevenue − treasuryCash)`,
  issues up to the creditor cash/ceiling/active-contract cap, pays accrued coupons,
  processes maturities, and applies the arrears/default rule. The requested-welfare
  memo is month-to-date, includes unpaid budget, and resets at close. It is not a
  liability; borrowing never posts retroactive back-pay. Treasury cash includes prior
  state-enterprise remittances, which are liquidity rather than tax revenue.
- **Constraints and reporting.** New issuance is limited by the designated
  creditor's actual cash, the issuer's outstanding-principal ceiling, and the active
  contract cap. An unissued requirement is reported as `unfinancedDeficitSUSD`; no
  invisible liability is created. The accounting fiscal result remains tax revenue
  minus actual welfare and interest expense; the two measures are distinct.
- **Scenario activity.** A bounded 31-day run of the shipped scenario issues a
  month-end USA contract and records the matching liability/bond asset; active
  liability equals the sum of active contract principal. Longer bounded probes cross
  coupon, maturity, refinancing, arrears/default, and compaction boundaries.
- **Maturity, refinancing, arrears, default.** At maturity, principal is refinanced
  into a replacement contract when the policy permits and the creditor can fund the
  net replacement; otherwise available treasury cash repays principal. Unpaid
  principal or interest sets an explicit `arrears` status. If arrears persist for
  the policy grace period, the remaining principal and accrued interest are written
  off explicitly and the contract becomes `defaulted`.
- **Integration.** M4b close, M4c tax/welfare, M5 shared markets/treasuries, and M5a
  profit distributions keep their existing semantics. `governmentPeriodTotals` now
  reports interest expense and a net fiscal result including it. M4b summaries keep
  exactly the four existing flow kinds.
- **Versions (Batch 4).** Schema **16**, simulation **0.16.0**, save format 1, data
  version `m3-economy-v3`. Schema-15 and older saves are rejected; no migration.
- **Limitations.** No commercial banking, deposits, central bank, monetary issuance,
  bond-market pricing, derivatives, external investors, debt-to-GDP target, debt
  auctions, or player/AI debt issuance actions. Automatic financing is liquidity-
  based and does not retroactively pay earlier unmet welfare. Interest is not taxed.
  The full campaign was not executed end to end.
## M6 deterministic country AI and action validation

M6 adds a rule-based country AI, a persisted evaluation schedule and goal, and one
shared player/AI action path. It is not a planner, a construction system, or a
politics system.

- **Enablement.** `World.countryAI.enabled` is scenario-provided and defaults to
  false. The eight-polity historical sample enables it; legacy M0–M5b fixtures
  remain disabled and retain their accepted economic behavior, with digests
  rebaselined only by the intentional schema/state change.
- **Cadence.** A country's first evaluation is the first day after the scenario
  start whose absolute day index is congruent to its stable country id modulo
  seven; later evaluations are seven days apart. The terminal `2000-01-01`
  boundary never evaluates. `Country.ai` persists `nextEvaluationDay`,
  `currentGoalId`, `lastDecisionDay`, and a bounded `lastActionSummary`.
- **Information boundary.** The decision function receives only
  `CountryAIObservation`: own fiscal policy, own treasury cash, own region ids,
  own population blocks and needs/unrest counters, the latest closed own-country
  fiscal totals, and own debt exposure. Other countries' private state, household
  account balances, future events, and the seed are absent. A test mutates hidden
  fields and asserts the governed country's observation and decision are unchanged.
- **Goals and rules.** Priority is solvency before relief. `restore-solvency`
  applies when treasury cash is below six months of observed annual outlays or
  observed annual outlays exceed observed annualized income-tax revenue; it raises
  tax by one percentage point toward a provisional 25% self-cap and cuts welfare
  to the affordable revenue share. `relieve-hardship` applies when at least 5% of own
  population has seven consecutive unmet subsistence days or weighted militancy is
  at least 0.15; it sets income tax to at least 5% and welfare to 25% of observed
  annualized tax revenue. Treasury reserves are a solvency buffer, not an ongoing
  spending target, so the welfare target is stable once revenue is observed; a new
  welfare action is suppressed unless the target changes by at least 10%, which
  prevents month-to-month revenue noise from producing weekly actions.
  `maintain` makes no change. Missing pre-close revenue is unknown, not zero.
  Constants are provisional, documented in `packages/sim/src/economy/constants.ts`,
  and are not calibrated behavioral parameters.
- **Action validation.** `set-fiscal-policy` is the only implemented action.
  `validateCountryAction` and `applyCountryAction` are shared by player and AI.
  Invalid player actions throw and leave the world unchanged. Invalid AI proposals
  are counted in `diagnostics.invalidActionCount`, recorded in the bounded warning
  buffer, and skipped; the sample campaign reports zero.
- **No money creation.** The action changes only the existing M4c fiscal policy.
  It creates no cash, debt, posting, flow kind, negative balance, or hidden
  obligation. M4b close and M4c fiscal semantics are unchanged.
- **Not included.** Building queues/construction, infrastructure or production
  prioritization, laws, debt actions, diplomacy, military actions, AI randomness,
  and any AI access to hidden state. M6 does not lower income tax in v1.
- **Versions.** Schema **13**, simulation **0.13.0**, save format 1, data version
  `m3-economy-v1`; schema-12/0.12.0 saves reject with no migration.

### M6 performance behavior

Profiling the full campaign found two growing costs in the tick clone path:
repeatedly revalidating every immutable monthly summary, and deep-copying every
closed summary's account totals on every tick. `assertValidWorldForTick` now
validates the newest summary and its links on the hot path, while construction,
save/load, the monthly close, and `assertValidWorld` still validate the complete
history (D-059). The hot-path `cloneWorldForTick` copies the summary array but
shares the immutable closed summary objects, so a staged close appends a new
summary without copying the century-long history; public `cloneWorld` retains full
summary-deep-copy isolation required by the accepted M4b tests. These changes
alter validation and clone cost, not simulation results or hashes. The measurements and identified bottlenecks are
in [the benchmark section](#benchmark-scope-and-recorded-node-results) and the
[M6 completion report](#m6-completion-report).

## M7 playable Expo shell and worker protocol

M7 adds the first user-facing Century shell. It is a playable client over the
existing deterministic simulation, not a new simulation subsystem. **Web and
Hermes JS bundles are verified; native release builds and real-device performance
are not.** M7 therefore carries an explicit acceptance exception (D-061).

- **Worker boundary.** `packages/sim-worker` owns the authoritative world. Its
  app-safe root exports protocol constants, snapshot types, pure selectors, and
  the storage codec; the host/snapshot/worker entries are subpath exports. The app
  never imports `@century/sim` or `@century/data`, and the architecture test
  enforces that boundary.
- **Protocol version 1.** Commands are `START`, `PAUSE`, `STEP`, `SET_SPEED`,
  `APPLY_ACTION`, `REQUEST_SNAPSHOT`, `SAVE`, `LOAD`, and `SHUTDOWN`, each with a
  stable command id. Events are `READY`, `SNAPSHOT`, `STATE`, `ACTION_RESULT`,
  `SAVE_RESULT`, `LOAD_RESULT`, `ERROR`, `FATAL`, and `SHUTDOWN`. Malformed
  messages are rejected before dispatch.
- **Immutable snapshots.** The worker emits bounded, recursively frozen snapshots
  containing eight country summaries, 16 regions, five market price/stock cards,
  eight goods, at most 12 monthly finance periods, and bounded diagnostics. The
  sample snapshot is about 11.8 KiB. No typed arrays, accounts, postings, or live
  world references cross the boundary. Snapshot delivery is rate-limited to at
  most one per 100 ms and can lag when a tick is slower.
- **Transports.** Web uses a Blob-backed Web Worker. iOS/Android use a hidden
  `react-native-webview` as a separate JavaScript context; commands use
  `injectJavaScript`, and events use `ReactNativeWebView.postMessage`. Node
  `worker_threads` is the headless proof of concept. No unmaintained native worker
  package is adopted.
- **Screens.** Map, Country Dashboard, Budget, Population and employment, Markets
  and prices, and Ledger/financial summary. The map is a stylized 16-region
  authored-sample grid with country selection; the 500-region production map,
  pan/zoom, and broad annual charts are not implemented. The screen states this.
- **Controls and actions.** Start/pause, step one day, speeds 1/2/5/10 simulated
  days per second, save/load, and the shared `set-fiscal-policy` player action.
  Commands apply only between complete ticks; the app cannot mutate the world.
- **Save/load.** The canonical save string is compressed with gzip and base64 at
  the AsyncStorage boundary (`century-save-gzip1:`). This reduces the sampled
  353.5 KiB save to 72.2 KiB without changing the canonical format, checksum,
  schema, or hash. Loading restores the saved day and fiscal policy in the
  verified web path.
- **Verification.** Expo web export, iOS/Android Hermes bundle exports, a Node
  worker-thread proof, a simulated ReactNativeWebView bridge probe, and headless
  Chromium Pixel 5 interactions passed. The browser interaction test covered
  start/pause/step, fiscal action, gzip save/load, month-end ledger rendering, and
  zero page errors.
- **Unmet acceptance.** No native release build was produced because Xcode,
  Android SDK/emulator, and a reference device are unavailable. Real-device frame
  rate, cold start, memory, battery, and on-device tick p95 are **NOT EVALUATED**.
  Node worker tick+snapshot p95 was 80.46 ms, which is not mobile evidence and is
  far above the 8 ms mobile target. The vertical slice is **not claimed complete**
  until release builds run on both platforms and on-device measurements are
  recorded.
- **Versions.** The simulation schema remains **13**, simulation version
  **0.13.0**, save format **1**, data version `m3-economy-v1`. M7 adds no
  authoritative simulation state and no save-compatibility change; the worker
  protocol has its own version **1**.

## Planned development roadmap, Economic Management Overhaul, and intermediate finance stages

M0–M6 are implemented and accepted; M7's shell/worker implementation is delivered
with an explicit native-release and real-device acceptance exception. The designer
has adopted intermediate finance stages (recorded as D-050) for work that earlier
revisions left unassigned, and the **Economic Management Overhaul (E0–E6)** as the
player-facing economic program (D-070). **E0, E1, E2, E3, E4, M7a, M8, M9, and E5 are
implemented; E6 and M8a remain planned and not implemented.** E1 is
presentation/selectors, a
bounded monthly report, and session-confirmed action history; it adds no new
economic mechanic. M7a adds bounded annual summaries and audited controlled
corrections; it changes the authoritative finance schema. M8 adds political
institutions, laws, elections, interest groups, unrest/crisis, administration, and
scripted events. M9 adds validated technology content, funded research, technology
effects, education staffing/payroll, and age-specific literacy. E5 adds funded
vocational training and qualification, a staffed public-health service, a training
stipend, and minimum-wage/hours/health laws. The later stages
preserve existing M0–M10 milestone identities and do not change
M4a/M4b/M4c/M5/M5a/M5b/M6. M7 adds the worker protocol and UI outside the
simulation schema.

Finance/engineering order:

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

Combined planning order with the player-facing economic program:

`M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4 → M8 → M9 → E5 → E6 → M10`

| Stage | Placement | Planned scope | Status |
|---|---|---|---|
| **M5a** | After M5, before M5b and M6 | Profit distributions to designated private owners/household capitalists or deterministic retention as business funds; actual state-owned-enterprise profit remittances to country treasuries through balanced postings; ownership, timing, account semantics, and available-funds constraints | Accepted |
| **M5b** | After M5a, before M6 | Versioned public-debt contracts, issuance with matching asset/liability entries and cash transfers, interest, maturity/principal repayment, refinancing, arrears, and explicit default; separation of deficit, financing, borrowing proceeds, interest expense, and principal repayment | Accepted |
| **E0** | Design now | Economic Management policy framework, dependencies, authority boundaries, accounting/persistence implications, UI information architecture, acceptance criteria, E0–E6 sequence, and exclusions (GDD v2.6 §17A; preserved in v2.8) | Documented; no simulation code |
| **E1** | After M7 | Economic clarity/dashboard, supported causal explanations, pre-commitment explanations, bounded monthly economic report/action history, focused improvements to the six M7 screens | **Implemented** (GDD v2.8 §17A.17; D-071) |
| **E2** | After E1 (M7a recommended first) | Fiscal management: supported tax/spending instruments, budget allocation, reserves, borrowing/repayment/refinancing controls, financing constraints | **Implemented** (GDD v2.12 §17A.18; D-073) |
| **E3** | After E2 | Public investment/construction: project queue, real money/labor/material/time requirements, financing, progress/completion, cancellation/failure, actual assets | **Implemented** (GDD v2.12 §17A.19; D-074) |
| **E4** | After E3 | Industrial/business policy: selected subsidies, procurement, investment incentives, public-enterprise investment, sector programs | **Implemented** for sectors/materials/subsidy/support (GDD v2.12 §17A.20; D-075); delayed/general procurement, private co-financing, loans/guarantees, tax credits, and expansion/discontinuation deferred |
| **M8** | After E4 | Political institutions, laws, elections, unrest, instability, events | **Implemented** (GDD v2.12 §17C; D-076; schema 21 / sim 0.21.0 / protocol 8 / data `m3-economy-v6`) for taxation/suffrage/labor/trade laws, elections, interest groups, unrest/crisis, administration, and scripted events; other law slots deferred |
| **M9** | After M8 | Technology, research, education/literacy mechanics | **Implemented** (GDD v2.13 §17D; D-077; schema 22 / sim 0.22.0 / protocol 9 / data `m3-economy-v7`) for the 120-technology tree, funded research work, effects, education institution, age-specific literacy, and technology-gated education laws; military technology deferred to M10 |
| **E5** | After M8/M9 | Labor/social institutions: services/transfers/training, health effects, labor laws, pensions/social insurance where supported | **Implemented** for funded vocational training/qualification, a training stipend, public health via the administration clerk base, minimum wage, working hours/standards, and the public-health staff floor (GDD v2.14 §17E; D-078; schema 23 / sim 0.23.0 / protocol 10 / data `m3-economy-v8`); pensions, collective bargaining, labour-market enforcement, and cross-profession promotion deferred |
| **E6** | After E5 | E6a real trade/commercial policy; E6b monetary foundations (retained M8a scope) | Planned |
| **M7a** | After M7, before M8; recommended before E2 | Annual finance summaries/periods, year-end close consistent with M4b, partial years, audited controlled correction/reversal | **Implemented** (GDD v2.8 §17B; D-072; schema 17 / sim 0.17.0) |
| **M8a** | Retained as E6b | Inflation/price-level measure, exchange-rate dynamics, monetary authority/controls, balanced money/credit accounting | Planned |

Key boundaries:

- **The playable vertical slice remains M0–M7.** M7a is implemented; M8a and E2–E6
  are post-slice stages and are not prerequisites for the initial playable release.
  M5–M7 are not blocked on the later monetary systems.
- **M5a depends on M5** for the multi-country foundation and the
  ownership/enterprise structures it actually delivers; if those structures are
  missing, M5a must add them explicitly rather than assume them.
- **M5b precedes M6** so country AI operates against defined borrowing
  constraints, interest, maturities, and default consequences.
- **M6 (accepted)** adds deterministic country AI v1 and shared player/AI fiscal
  action validation. It does not add construction, laws, debt actions, diplomacy,
  or military actions.
- **M8a follows M8** because monetary authority and policy controls depend on
  institutions and laws; any missing prerequisite (for example a banking/deposit
  system or monetary aggregate) must be recorded rather than hidden. In v2.6 its
  scope is retained as E6b.
- **E0 is design; E1 and M7a are implemented.** E1 adds no E2–E6 lever, construction
  queue, trade rule, or monetary control. M7a adds annual finance summaries and
  controlled correction records only. Every later lever still has an explicit
  dependency or remains unimplemented. E1's snapshot additions are derived
  presentation data; M7a changes world schema **17** / simulation **0.17.0**.
- The full planned scope, acceptance boundaries, and dependency rationale are in
  GDD v2.8 §17A, §17B, and §17.5. This section is a repository summary, not a claim
  of current support beyond M7a/E1.

## Data and calibration

Static definitions:

- [`needs.json`](./packages/data/data/needs.json) — M2 needs fixture.
- [`m3_needs.json`](./packages/data/data/m3_needs.json) — M3 needs, excluding
  deferred services.
- [`goods.json`](./packages/data/data/goods.json) — eight M3 goods.
- [`professions.json`](./packages/data/data/professions.json) — four M3
  profession definitions.
- [`buildings.json`](./packages/data/data/buildings.json) — eight M3 building
  definitions.
- [`demography.json`](./packages/data/data/demography.json) — ASFR and
  sex-specific mortality anchors.
- [`scenarios/m3_small_economy.json`](./packages/data/data/scenarios/m3_small_economy.json)
  — synthetic single-region M3 structural fixture.
- [`scenarios/m2_world_aggregate.json`](./packages/data/data/scenarios/m2_world_aggregate.json)
- [`scenarios/m2_multi_block.json`](./packages/data/data/scenarios/m2_multi_block.json)
- [`scenarios/m2_wpp_1950_validation.json`](./packages/data/data/scenarios/m2_wpp_1950_validation.json)
- [`calibration/m2_population_targets.json`](./packages/data/data/calibration/m2_population_targets.json)
  — OWID total-population series.
- [`calibration/wpp_age_sex_reference.json`](./packages/data/data/calibration/wpp_age_sex_reference.json)
  — WPP 2024 age/sex validation references for 1950/1975/2000.
- WPP 2024 ASFR and sex-specific mortality are integrated **annually for
  1950–2000** in `demography.json`.
- [`source_notes.md`](./packages/data/data/source_notes.md)
- M5 historical sample: [`scenarios/m5_eight_polities.json`](./packages/data/data/scenarios/m5_eight_polities.json),
  [`historical/countries_1900.json`](./packages/data/data/historical/countries_1900.json),
  [`historical/regions_1900.json`](./packages/data/data/historical/regions_1900.json),
  [`historical/markets_1900.json`](./packages/data/data/historical/markets_1900.json),
  [`historical/pops_1900.json`](./packages/data/data/historical/pops_1900.json),
  [`historical/buildings_1900.json`](./packages/data/data/historical/buildings_1900.json),
  [`historical/employment_1900.json`](./packages/data/data/historical/employment_1900.json),
  [`historical/calibration_targets_1900.json`](./packages/data/data/historical/calibration_targets_1900.json),
  and [`historical/source_notes.md`](./packages/data/data/historical/source_notes.md).
  Population targets are source-referenced rounded estimates; occupation
  composition and all other 1900 structure are provisional (D-053). The scenario
  enables the provisional M5a profit-allocation policy (D-056) and the M6
  country-AI policy (D-058); the historical buildings are private, so state
  remittances are exercised by focused tests.

### Campaign gameplay baseline

The campaign starts from the source-derived January 1, 1900 total,
**1,621,287,278**. It uses the provisional 1900 age/sex distribution and
pre-1950 schedules, so it is a **no-shock gameplay baseline**, not the historical
validation configuration.

| Year | Model | Source Jan 1 | Relative error |
|---:|---:|---:|---:|
| 1900 | 1,621,287,278 | 1,621,287,278 | 0.000% |
| 1950 | 2,454,331,503 | 2,480,507,938 | -1.055% |
| 2000 | 6,715,972,921 | 6,130,354,660 | +9.553% |

- Maximum annual relative error: **9.553%** at 2000.
- RMSE across 101 annual samples: **5.320%**.
- Full-century aggregate hash: `ebf0a37a515e18d0` for seed `20261023` under
  schema 5.

The 2000 excess comes from the campaign's too-young 1950 age/sex composition,
not from post-1950 coefficient tuning. At 1950 the campaign has about 17.1M fewer
people than WPP, but +26.1M males, -43.2M females, +20.5M women aged 15–49, and a
1950 age structure with ~39.0% aged 0–14 versus ~34.7% in WPP. Its expected 1950
births are ~95.9M versus ~90.5M, and expected deaths at the same schedules are
~39.9M versus ~47.9M. The provisional pre-1950 inputs—especially
duplicated-by-sex mortality and the stylized 1900 age distribution—are the
cause. No safety margin is applied.

### Historical validation against WPP 2024

The WPP 1950-initialized validation scenario starts at the source-backed
2,471,424,002 age/sex distribution and uses annual source-backed ASFR/mortality.

| Year | Model total | WPP total | Total error | Max five-year share difference | Male-share difference |
|---:|---:|---:|---:|---:|---:|
| 1950 | 2,471,424,002 | 2,471,424,002 | 0.00% | 0.00 pp | 0.00 pp |
| 1975 | 4,041,822,105 | 4,034,031,762 | +0.193% | 1.08 pp | -0.085 pp |
| 2000 | 6,205,160,776 | 6,129,943,964 | +1.227% | 0.55 pp | -0.185 pp |

Cumulative 1950–1999 flows: model births 6,117,076,588 vs WPP 6,089,003,488
(+0.461%); deaths 2,383,339,814 vs 2,430,494,039 (-1.939%); net change
3,733,736,774 vs 3,658,509,449 (+2.057%). Validation hash:
`fae7f28d69845067`.

The earlier 5.2–5.5% shortfall came primarily from interpolating only three
benchmark years; annual WPP schedules restore the 1960s fertility peak and
annual fertility decline. The remaining +1.2% is reported, not tuned away.

### Provisional inputs

- 1900 age/sex distribution: stylized 1900 age shares split by WPP 1950
  age-specific sex shares.
- 1900–1949 ASFR: WPP 1950 schedule scaled by 1.05 (1900) and 1.00 (1949).
- 1900–1949 mortality: earlier stylized schedule duplicated by sex and
  multiplied by 1.45 (capped at 1,000 per 1,000).
- Sex ratio at birth 1.05 is provisional.
- Within-five-year-band single-age expansion is uniform.

The simulation does not read target totals to force its trajectory. Historical
validation and the campaign gameplay baseline are deliberately separate.

## Determinism and serialization

- Schema version: `13`; simulation version: `0.13.0`; data version:
  `m3-economy-v1` (M5 adds historical scenario content, M5a adds a
  scenario-provided policy/account role, M5b adds debt state, and M6 adds the
  AI policy/state without changing existing definition or scenario meaning; see
  D-053/D-056/D-057/D-058).
- Schema-12 / simulation-0.12.0 saves are rejected with an actionable error; no
  migration is attempted. Schema-8 through schema-11 remain rejected as before.
- **M7 does not change the simulation save schema.** Its worker protocol is
  version 1 separately. The app receives snapshots, never the world. Save storage
  gzip-compresses the canonical string at the AsyncStorage boundary and preserves
  its checksum/hash semantics.
- `maleByAge` and `femaleByAge` are tagged `Uint32Array` values. The payload also
  includes `startDayIndex`, fractional birth/male-split/death remainders, finance
  accounts with `category`/`subtype`, `nextAccountId`, the opening-balance
  record, monthly `periodSummaries` with `closedThroughDay`, the M4a-2
  country/currency/valuation collections, the M4c country
  `treasuryAccountId`/`fiscal` state, the M5 country `immigrationOpen` policy, the
  M5b debt policy/contract state, and the M6 `countryAI` policy plus each
  country's fixed-size `ai` schedule/goal state.
- Canonical JSON makes checksum and decode independent of object key insertion
  order. The state digest covers single-year sex state, accounts, diagnostics,
  `startDayIndex`, the opening record, period summaries, the close boundary,
  countries/currencies/valuations, the fiscal policy/treasury fields, the M5
  border-policy field, debt state, and AI state.
- Empty-world M1 regression digest (seed `123456789`, scenario
  `m1-determinism`): `6fb09e29921a441b`.
- Full-century aggregate digest: `1833f89be242413d`.
- WPP validation digest: `1a5c39b503b54f1b`.
- M3 structural-world digest (seed `20261023`): `509ad0250da27037`.
- The digests were re-baselined for M6 because the world schema version,
  `World.countryAI`, and `Country.ai` are part of canonical hashed state. Legacy
  fixtures keep AI disabled with null goals, so their economic behavior and
  account sets are unchanged; the schema/state fields alone changed the digests.
  D-058 records the version decision, and D-059 records the tick-path summary
  validation optimization that leaves hashes unchanged.
- Multi-country digests are exercised by repeated-run and save/resume tests rather
  than a fixed literal, because the eight-polity sample is expected to evolve as
  historical content improves. The M5/M6 benchmarks print the sampled hashes.

## Benchmark scope and recorded Node results

`pnpm run bench` reports M1 no-op, M2.1 world-aggregate century, M2.1 stress
cases at 200, 1,000, 3,000, and 6,000 population blocks, an M3b
employment-refresh workload, M3c production/inventory workloads, M3d market-day
workloads, M3e settlement workloads, M3f integrated economic-day workloads, M4b
monthly period-close workloads, M4c fiscal-day workloads, M5/M5a eight-polity
campaign, migration, profit-allocation, serialization, and stress workloads, and
M6 AI-enabled representative/stress workloads, and M7 worker-host complete
tick+snapshot/save-codec workloads. The opt-in
`pnpm run bench:campaign` executes the complete M6 campaign. Stress scales repeat
the three deterministic multi-block templates (400k/350k/250k people), so total
population grows with block count. Each M2 stress scale uses 100 warm-up ticks and
730 measured ticks.

**Post-M7 remediation note (D-062/D-063).** The M5/M6/M7 tables later in this
section were recorded before the historical scenario feasibility calibration. That
scenario now has 113 buildings (including fisheries/ranches), a separate historical
goods/buildings/professions/needs catalog, opening intermediate stock, and opening
prices at the lower provisional bound. The older timings and the 81-building /
85,487,776-population campaign row are retained as history and are **not** results
of the current scenario. The current `pnpm bench` results are recorded in
“Post-M7 remediation batch 5” near the end of this file. The full 36,524-tick
campaign has not been rerun after D-062.

**M4a-1 re-measurement note.** The M3b–M3f tables below are the recorded
pre-M4a-1 (schema-5) baselines and are retained as history. M4a-1 changes
authoritative account state and posting line shape, so world hashes differ and
Node timings shifted. M4a-2 adds three empty canonical collections to every world
(countries, currencies, currency valuations), M4b adds monthly summaries and the
close boundary, and M4c adds country fiscal accounts/state and per-block fiscal
accounts, so the benchmark hashes in this section predate those stages; timings
are not treated as acceptance evidence. The current M4a-1 Node run on the same
machine produced:

| Case | Avg | p95 | Hash |
|---|---:|---:|---|
| M1 empty no-op | 0.0014 ms | 0.0019 ms | `ef4c9b445cb9fe46` |
| M2 aggregate century | 0.122–0.131 ms | 0.221–0.275 ms | `8e8e021bd3c8bcb5` |
| M2 stress 200 blocks | 3.518 ms | 4.444 ms | `f3910bf5f49a389b` |
| M3b employment refresh | 0.115 ms | 0.211 ms | `6aa1600321895ea1` |
| M3c production small | 0.423 ms | 0.802 ms | `c156f26fc0b37489` |
| M3d market small | 0.974 ms | 1.517 ms | `1ae1b609a2cc5f07` |
| M3e settlement small | 0.622 ms | 1.032 ms | `17e14e188acd7e7a` |
| M3f economic day small | 8.393 ms | 13.341 ms | `03477b2f8bdeebad` |
| M3f economic day stress | 41.407 ms | 49.596 ms | `fd6b87b4c7c1ed16` |

The M3e/M3f workloads are slower under M4a-1 because every transaction now posts
recognition legs (2 lines became 4–7) and validation covers the richer account
set. The 200-block p95 guard was reported as passing in that earlier run. These
are Node diagnostics only;
the GDD mobile p95 ≤ 8 ms target remains **NOT EVALUATED**.

Representative runs on Node `v22.12.0`, Windows x64, AMD Ryzen 5 2600 (12 logical
processors), 7.93 GiB RAM, seed `20261023`:
| Case | Blocks | Population | Ticks | Total | Avg/tick | p95 |
|---|---:|---:|---:|---:|---:|---:|
| M1 no-op | 0 | 0 | 36,524 | 32–66 ms | 0.0009–0.0018 ms | 0.001–0.003 ms |
| M2 aggregate | 1 | 1.62B start | 36,524 | 1.27–1.50 s | 0.0347–0.0410 ms | 0.040–0.072 ms |
| M2.1 stress | 200 | 67,290,866 | 730 | 1.68–1.75 s | 2.31–2.40 ms | 2.78–3.07 ms |
| M2.1 stress | 1,000 | 336,102,399 | 730 | 8.60–9.42 s | 11.78–12.91 ms | 12.74–15.43 ms |
| M2.1 stress | 3,000 | 1,008,106,000 | 730 | 29.95–32.24 s | 41.03–44.17 ms | 47.62–52.18 ms |
| M2.1 stress | 6,000 | 2,016,212,000 | 730 | 63.55–69.08 s | 87.06–94.63 ms | 103.03–117.90 ms |

The 200-block provisional Node regression guard is p95 ≤ 5 ms. A remediation
remeasurement compared an isolated pre-M4c worktree at `02d3bfb` with the current
build on the same machine and fixed scenario/settings. Baseline (`02d3bfb`):
avg `3.694 ms`, p50 `3.520 ms`, p95 `4.854 ms`, p99 `6.238 ms` (PASS). Current
remediation run A: avg `3.783 ms`, p50 `3.533 ms`, p95 `5.031 ms`, p99 `8.704 ms`
(guard missed); run B: avg `3.703 ms`, p50 `3.503 ms`, p95 `4.519 ms`, p99
`6.489 ms` (PASS); final `pnpm run ci`: avg `3.331 ms`, p50 `3.310 ms`, p95
`3.861 ms`, p99 `4.191 ms` (PASS). The guard is provisional and remains noisy; the
misses and passes are reported rather than adjusted or hidden. Countryless worlds
keep the original M2 account set and population tick path, so this is treated as
Node measurement variation, not a demonstrated M4c regression. Larger scales are
diagnostic, not acceptance thresholds. The GDD mobile p95 ≤ 8 ms target is **NOT
EVALUATED**; this is a Node harness, not a mobile release build.

The M3b employment workload uses the fixed small M3 world: 4 pop blocks,
8 buildings, 3 seed assignments, and 1,061,870 people at seed `20261023`. It
resets employment to the seed assignments and marks it dirty on each sample,
then times only the real `refreshEmploymentIfDue` call at day 10. Reset,
validation, and hashing are excluded. With 100 warm-up refreshes and 1,000
measured refreshes it produced 8 assignments and 154,400 assigned workers, with
an identical assignment/world hash `0a375c251ed26af7` on every measured sample.
Final CI Node result: total `116.9 ms`, average `0.117 ms`, p50 `0.090 ms`,
p95 `0.202 ms`, p99 `0.475 ms`. Across verified runs, average was
`0.10–0.18 ms`, p95 `0.15–0.42 ms`, and p99 `0.26–0.88 ms`, reflecting normal
Node timing variation. This is a Node diagnostic only; it is not a mobile or
full-scale-economy claim.

The M3c production workloads use fixed reservations derived from opening
inventory and reset inventory before each phase; only `runProductionPhase` is
timed. Results from the same Node environment:

| Workload | Pop blocks | Buildings | Reservations | Phases | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M3c small | 4 | 8 | 5 | 500 | 0.231 ms | 0.187 ms | 0.421 ms | 0.917 ms | `098974b94d5446ff` |
| M3c stress | 40 | 80 | 60 | 100 | 2.589 ms | 2.274 ms | 4.556 ms | 5.463 ms | `dd8cffec9ab41826` |

The small case produced `349,415.133` units and used `51,687.5` input units per
phase; the 10-group stress case produced `3,477,524.667` units and used
`516,875` input units per phase. Every measured sample used reservations and
produced output, and the world hash was identical across repetitions. Setup,
reset, validation, and hashing are excluded from timings. These are Node
diagnostics, not mobile-performance evidence.

The M3d workloads run the real `runMarketDay` phase with fixed demand records,
reset inventory and prices before each sample, and time only the market day.
The small case has 4 pop blocks, 8 buildings, 6 household demands, 3 input
demands, and 11 reservations. The 10-group stress case has 40 pop blocks,
80 buildings, 60 household demands, 30 input demands, and 1,100 reservations.
Each sample fulfilled household demand, used same-day output in Pass B, consumed
production inputs, and changed at least one price.

| Workload | Blocks | Buildings | Demands (H/I) | Reservations | Days | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M3d small | 4 | 8 | 6 / 3 | 11 | 100 | 0.498 ms | 0.446 ms | 0.765 ms | 1.540 ms | `209d39f952437547` |
| M3d stress | 40 | 80 | 60 / 30 | 1,100 | 50 | 11.864 ms | 11.363 ms | 16.678 ms | 19.195 ms | `ece3de98cd567e6a` |

The small case fulfilled `60,400` household units, including `10,000` in Pass B,
and consumed `1,687.5` production input units per sample. The stress case
fulfilled `604,000` household units, including `100,000` in Pass B, and consumed
`16,875` production input units per sample. This is a Node diagnostic; it makes
no claim about a runnable economic tick or target-scale mobile performance.

The M3e workloads run the real M3d market day first, reset inventory, prices, and
finance before each sample, and time only `settleMarketDay`. The benchmark fixture
seeds cash-backed household and operating accounts so full settlement is possible;
the unit tests cover underfunded wages/upkeep and rejected market funding
separately.

| Workload | Blocks | Buildings | Transactions | Wage settlements | Upkeep | Postings | Settlements | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M3e small | 4 | 8 | 11 | 7 | 250 SUSD | 26 | 50 | 0.396 ms | 0.306 ms | 0.650 ms | 2.839 ms | `67728eb2e9c69218` |
| M3e stress | 40 | 80 | 1,100 | 70 | 2,500 SUSD | 1,250 | 20 | 7.745 ms | 7.509 ms | 9.501 ms | 11.542 ms | `25f6e0a414108bb6` |

The small case settled `3,836.875` SUSD of purchases, `98,904.110` SUSD of
wages, and `250` SUSD of upkeep, with a `96,014.110` SUSD producer cash-basis
loss. The stress case settled `38,368.750` SUSD of purchases, `989,041.096` SUSD
of wages, and `2,500` SUSD of upkeep, with a `960,141.096` SUSD producer loss. No
wages or upkeep were unpaid in the cash-backed benchmark. Settlement times exclude
market-day setup, reset, and hashing; settlement validation is included. These are
Node diagnostics, not mobile-performance evidence.

The M3f workloads call the real integrated `tick()` on cash-backed M3 worlds. The
small case uses 4 pop blocks and 8 buildings; the stress case uses 5 groups
(20 pop blocks, 40 buildings). Setup and hashing are excluded, while the complete
daily tick is timed. All measured days used the conservative production-demand
fallback in this benchmark because full desired input demand could not be funded by
opening cash plus realized same-batch sales.

| Workload | Blocks | Buildings | Days | Transactions | Wages | Upkeep | Postings | Fallback days | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M3f small | 4 | 8 | 8 | 188 | 56 | 64 | 230 | 8 | 4.535 ms | 4.373 ms | 6.166 ms | 6.166 ms | `3a0b14d0ffa84be2` |
| M3f stress | 20 | 40 | 3 | 2,300 | 105 | 120 | 2,391 | 3 | 23.353 ms | 23.490 ms | 28.150 ms | 28.150 ms | `7a6d5b103aae682a` |

Profiling found that the original save-codec staging clone dominated the tick.
The clone averaged about `6.15 ms` and the day cloned twice; canonical checksum
encoding accounted for most sampled time. Replacing that clone with the structural
clone above reduced clone cost to about `0.14 ms` and produced:

| M3f workload | Before avg / p95 | After avg / p95 | Hash |
|---|---:|---:|---|
| small | 19.800 / 24.480 ms | 4.535 / 6.166 ms | `3a0b14d0ffa84be2` |
| stress | 56.672 / 59.513 ms | 23.353 / 28.150 ms | `7a6d5b103aae682a` |

After the change, CPU profiling is dominated by invariant validation
(`assertValidJournalPosting`, finance/economy/world/population validation) rather
than staging. Market clearing and settlement remain smaller shares. These are Node
diagnostics with the same workloads; hashes and state behavior are unchanged.
Mobile performance has not been measured on a reference device, so p95 ≤ 8 ms is
still **NOT EVALUATED**.

The M3f benchmark reports Node diagnostics only. The GDD mobile p95 ≤ 8 ms target
is **NOT EVALUATED**; the integrated tick uses whole-world structural staging, so
these timings are not mobile-performance evidence.

The M4b close benchmark times only `closeFinancePeriod` on a world reached two
days before the first month-end; world cloning, setup, and hashing are excluded.
It reports closing-entry counts, gross flows, and pass/fail checks for zeroing,
cash neutrality, the accounting identity, summary contiguity, determinism, and
cross-run hashes. These are Node diagnostics, not mobile evidence.

The M4c fiscal-day workload runs the real integrated `tick()` on a scaled M3
production economy plus one fiscal country. It reports income tax, welfare paid,
shortfall, treasury start/end, and pass/fail gates for treasury reconciliation,
cash conservation, accounting identity, positive tax/welfare, and cross-run hash
determinism. Warm-up and measured ticks are timed; setup and hashing are excluded.
Representative Node `v22.12.0` results on the same machine:

| Workload | Blocks | Buildings | Days | Tax SUSD | Welfare SUSD | Shortfall | Treasury start → end | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M4c small | 4 | 8 | 10 | 21,183.3067 | 27,397.2603 | 0 | 5,001,045.21 → 4,994,831.26 | 9.712 ms | 9.502 ms | 12.452 ms | 12.452 ms | `0a0a1d318ff8ef2b` |
| M4c stress | 12 | 24 | 5 | 31,863.4956 | 13,698.6301 | 0 | 5,008,865.44 → 5,027,030.30 | 18.524 ms | 18.870 ms | 19.802 ms | 19.802 ms | `eba2c5dd2b7bd647` |

The remediation added a full staged-world validation and fiscal posting-structure
checks, so M4c timings increased versus the pre-remediation table; they remain
Node diagnostics and are not mobile evidence. All M4c gates passed, including
treasury reconciliation, cash conservation, accounting identity, positive tax and
welfare, and equal cross-run hashes. The overall benchmark passed in the final
remediation rerun; the other rerun failed only the pre-existing provisional
200-block M2 guard (reported above), not an M4c gate. Mobile p95 remains **NOT
EVALUATED**.

The M5 workload loads the authored eight-polity historical sample and times the
real integrated `tick()` over a measured sample. It also times a validation +
serialization round trip, the monthly migration phase (clone excluded), the M5a
month-end profit allocation (close/clone excluded), and a doubled authored stress
fixture. The M5 table below is the historical M5b run, recorded under schema 12 /
simulation 0.12.0; the current M6 run uses schema 13 / simulation 0.13.0.

| Workload | Countries | Regions | Markets | Blocks | Buildings | Assignments | Ticks | Avg | p50 | p95 | p99 | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M5 eight-polity run 1 | 8 | 16 | 5 | 64 | 81 | 240 | 8 | 94.80 ms | 92.78 ms | 113.9 ms | 113.9 ms | `d2669e3679660124` |
| M5 eight-polity run 2 | 8 | 16 | 5 | 64 | 81 | 240 | 8 | 91.09 ms | 88.24 ms | 103.7 ms | 103.7 ms | `d2669e3679660124` |
| M5 stress (2 ticks) | 8 | 16 | 5 | 128 | 162 | 960 | 2 | — | — | — | — | `fccc342f56c29851` |

| M5 component | Result |
|---|---|
| Combined eight-polity tick | avg 92.95 ms, p50 90.38 ms, p95 113.9 ms, p99 113.9 ms |
| Validation + serialize/deserialize round trip | avg 60.22 ms, p50 59.70 ms, p95 62.36 ms |
| Monthly migration phase (clone excluded) | avg 71.62 ms, p50 73.39 ms, p95 79.33 ms; 932,314 people moved in the sample |
| M5a month-end allocation (close/clone excluded) | avg 5.933 ms, p50 5.603 ms, p95 7.355 ms; 81 buildings, 19,700,176.29 SUSD distributed |
| M5b debt phase (daily accrual + month-end coupon) | avg 5.232 ms, p50 4.952 ms, p95 7.242 ms; 2 contracts, 511.64 SUSD interest accrued |
| Projected full 36,524-tick campaign | about 0.94 h at the sample average; **not executed** and not mobile evidence |

The M5 full campaign was projected, not run, in the historical M5 table above. M6
adds an actual opt-in full-campaign execution. The reproduced M2 200-block p95 gate
remains at its unchanged provisional 5 ms threshold, but it was measured from a
single run and its documented variance means one run does not settle it. Mobile
p95 ≤ 8 ms remains **NOT EVALUATED**.

### M6 country-AI Node results

`pnpm run bench` now includes a 14-tick AI-enabled representative sample and a
14-tick doubled-block/building AI stress fixture. Both are timed with the real
`tick()`; the sample is run twice to check determinism. Representative Node
`v22.12.0` results on the same machine (seed `20261023`, schema 13 / simulation
0.13.0):

| Workload | Ticks | Avg | p50 | p95 | p99 | AI evaluations | Rejected | Hash |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| M6 sample run 1 | 14 | 83.15 ms | 83.02 ms | 90.57 ms | 90.57 ms | 16 | 0 | `e3b9d9965555d440` |
| M6 sample run 2 | 14 | 85.43 ms | 82.69 ms | 104.7 ms | 104.7 ms | 16 | 0 | `e3b9d9965555d440` |
| M6 combined | 28 | 84.29 ms | 83.02 ms | 94.34 ms | 104.7 ms | 16 (per run) | 0 | `e3b9d9965555d440` |
| M6 AI stress | 14 | 183.8 ms | 183.2 ms | 200.8 ms | 200.8 ms | 14 | 0 | `05db5c1247d296a8` |

The representative sample applied 4 AI fiscal actions across the measured ticks,
and the stress fixture (128 blocks, 162 buildings) recorded 14 evaluations with
zero rejected actions. Both runs produced the same hash, and
`diagnostics.invalidActionCount` was 0. A second `pnpm run bench` inside the final
`pnpm run ci` measured the combined sample at p50 `78.24 ms` / p95 `88.31 ms` /
p99 `114.7 ms` and the stress fixture at p95 `205.6 ms`; the difference is normal
Node run-to-run variation. These are Node diagnostics; mobile performance remains
**NOT EVALUATED**.

The opt-in full campaign executes all 36,524 ticks on the eight-polity sample and
is not part of `pnpm run ci`. Representative Node `v22.12.0` results:

| Metric | Result |
|---|---|
| Campaign | 36,524 daily ticks, seed `20261023`, end day 36,524 (terminal) |
| World | 8 countries, 16 regions, 5 markets, 64 blocks, 81 buildings; final population 85,487,776 |
| Tick timing | total 102.63 min; avg **168.6 ms**, p50 **144.3 ms**, p95 **185.8 ms**, p99 **1,024.0 ms** |
| AI activity | 41,740 evaluations, 269 applied policy actions, 0 rejected, `invalidActionCount = 0` |
| State checkpoints | 986 accounts at every checkpoint; postings capped at 256; 0 → 1,200 monthly summaries; 0 debt contracts |
| Final hash / save | `d1f5895277720e80`; 19,207.4 KiB (18.76 MiB) |
| Bounded-state gates | constant accounts PASS, postings ≤ 256 PASS, summaries ≤ 1,200 PASS |
| GDD 4 MiB save target | **NOT MET at the M6 baseline** (18.76 MiB); Batch 3 (D-065) changes the retained history and measures a 2.04 MiB canonical worst-case fixture. The full campaign was not rerun. |

The p99 is much higher than p95, indicating occasional heavier ticks; the median
path is about 144 ms. The benchmark reports the tail but does not decompose every
spike into close, validation, or garbage-collection time. The full campaign is a
Node diagnostic, not a mobile measurement. It does not measure device frame rate,
device memory, battery, or release-build tick time; the mobile p95 target remains
**NOT EVALUATED**.

A Node CPU profile of a 300-day sample after the clone fix attributes the remaining
self time mainly to repeated whole-world validation
(`assertValidWorld`/`assertValidFinanceState`/`assertValidEconomyState`, roughly a
quarter of samples), finance-index/account lookups (roughly 15%), immutable-summary
validation (roughly 6%), garbage collection (roughly 5%), and market/settlement
work (a few percent). AI evaluation itself is not a dominant cost. M6 identifies
these bottlenecks but does not undertake a broader validation/architecture
refactor.

The full campaign remains a Node diagnostic. It does not measure device frame rate,
device memory, battery, or mobile release-build performance; the mobile p95 target
remains **NOT EVALUATED**.

### M7 worker and app results

`pnpm run bench` now includes a bounded M7 worker-host case: complete tick plus
immutable snapshot, snapshot payload size, and gzip save codec. On the recorded
Node environment (seed `20261023`, eight-polity sample):

| M7 workload | Result |
|---|---|
| Complete tick + snapshot | avg `75.26 ms`, p50 `74.44 ms`, p95 `80.46 ms`, p99 `80.46 ms` |
| Snapshot payload | `11.8 KiB` |
| Save storage | `353.5 KiB` canonical → `72.2 KiB` gzip/base64 |
| Save compress + decompress | avg `38.36 ms`, p50 `29.40 ms`, p95 `62.50 ms` |
| Node worker-thread proof (`pnpm -F @century/sim-worker poc`) | PASS — start/pause/step/save/load/shutdown round-trip |
| Expo web export | PASS — `1.4 MB` JS bundle |
| iOS Hermes JS bundle | PASS — `2.4 MB` `.hbc` |
| Android Hermes JS bundle | PASS — `2.4 MB` `.hbc` |
| Headless Chromium Pixel 5 interaction | PASS — start/pause/step, fiscal action, save/load, month-end ledger, zero page errors |
| Simulated ReactNativeWebView bridge probe | PASS — READY, snapshot, step, no errors |

These are Node/browser/JS-bundle results. **No native release build or real-device
measurement exists.** Mobile FPS, cold start, memory, battery, and on-device tick
p95 remain **NOT EVALUATED**. The 80.46 ms Node tick+snapshot p95 is not mobile
evidence and does not satisfy the 8 ms mobile target.

## Known limitations

- M4a-1 adds category-aware double-entry accounts, recognition legs, and opening
  balances only. Distributions, remittances, debt, inflation, and dynamic FX are
  not implemented; the income tax added by M4c is the only tax.
- M4a-2 adds country/currency identity, monetary arrangements, and
  SUSD-relative valuations only. It has no issuance, central bank,
  native-currency balances, dynamic FX, currency regimes, inflation, monetary
  policy, or trade settlement. M4c adds treasury accounts for fiscal flows, not
  monetary policy.
- M4a-2 uses only the three runtime collections; no static currency catalog or
  `fxToUSD` field exists. Currency identity is independent of the domestic
  arrangement: a country may issue a currency it does not use domestically.
- M4a-2/M4c country, currency, treasury, and fiscal fixtures are inline tests, not
  shipped historical data; no country, currency, exchange-rate, tax, or spending
  calibration is claimed.
- Inventory is not an accounting asset: input purchases are expensed when
  purchased and there is no COGS or inventory valuation. This is a provisional
  cash-basis simplification, not full accrual accounting.
- M4b closes revenue and expense into existing owner equity at each month-end;
  there is no annual close, reopen, reversal/adjusting entry, retained-earnings
  subtype, or distribution. Summary flow totals are gross mapped period
  activity, not profit or taxable income. M4c country tax revenue and welfare
  expense close through the same mechanism; the four summary flow kinds are
  unchanged.
- M4c implements only a flat wage-only residence-based income tax and one
  budgeted per-capita welfare transfer. Collection efficiency is fixed at 1.0;
  there are no exemptions, strata, law bounds, corporate/consumption/land/tariff
  taxes, government procurement or services, state employment, subsidies,
  debt service, debt, arrears, or deficit financing. A welfare funding shortfall
  is unfunded and reported, not a liability. Fiscal policy cannot yet be changed
  by a player/AI action; M6/M7 supply actions and M8 the taxation law.
- The M4c wealth refinement uses current-day wages plus welfare as income and
  withheld income tax as mandatory payments annualized by the civil year; a
  trailing-month income window remains unimplemented.
- Published validation cannot prove which days were processed before the first
  close. The first period may be partial and gap detection applies between
  recorded summaries only; this convention is documented in the GDD and
  `DECISIONS.md` and is not a completeness guarantee.
- Opening balances are applied once as validated initial state with a provenance
  record rather than as one journal posting per account, so the bounded posting
  buffer begins with transactions.
- Full historical demographic calibration is incomplete: the 1900 age/sex
  distribution and 1900–1949 ASFR/mortality are provisional.
- The WPP 1950-initialized validation is within +0.2%/+1.2% at 1975/2000, with
  age shares within 1.1 pp; the campaign no-shock baseline is +9.6% at 2000
  because its provisional 1900/pre-1950 age/sex composition is too young.
- The sex ratio at birth and within-band age expansion are provisional.
- Mortality is derived from WPP deaths/mid-year population rather than a
  published `mx` table.
- M2.1 intentionally omits GDD §6.4 household-asset drawdown; only annual
  disposable income finances needs.
- Single-year sex state increases per-block cost; 6,000-block Node timing is not
  mobile evidence.
- `Math.log`/cross-engine floating-point identity remains an open limitation.
- M3a–M3f implement economy state, the cash ledger, employment assignment, a
  physical production phase, two-pass market clearing, cash settlement of
  purchases/wages/upkeep with retained profit, and an integrated economic day:
  M4a–M4c add accounts, the country/currency model, the monthly close, and the
  income-tax/welfare fiscal loop; M5 adds multi-region/multi-country worlds,
  multiple and shared markets, migration, geographic labor access, and the
  historical-data pipeline. Dividends/securities markets, broader government
  finance, politics, technology, diplomacy, warfare, profession
  promotion/demotion, inter-market trade, and UI remain absent. M6 adds a
  rule-based country AI and one fiscal-policy action, not a general planner.
- M3 recipe, population, and price values are synthetic provisional inputs, not
  calibrated historical data.
- M3f runs the economic day through the public `tick()` for worlds with buildings
  and markets; M2-only worlds retain their existing needs-fixture path. M3b–M3e
  focused benchmarks and M3f integrated-day benchmarks are Node diagnostics, not
  a runnable full-scale/mobile validation.
- M3c storage capacity uses a provisional `quantity × level × condition` rule;
  overflow is pooled by market rather than assigned to individual warehouses.
- M3d price coefficients are provisional, and price updates use gross opening
  stock plus same-day production; final overflow losses do not feed back into the
  same day's price.
- M3e uses base annual wages without wage index, labor scarcity, inflation, law,
  or wage-productivity adjustments; producer profit is cash-basis and retained.
  Upkeep is `dailyUpkeepSUSDAtLevelOne × level` for operational buildings and is
  not condition- or staffing-scaled. Underfunded employers/building accounts pay
  pro-rata wages/upkeep and report shortfalls without creating debt. Owner profit
  distribution remains deferred.
- M3f monthly wealth uses the current day's actual settled household income
  (wages plus M4c welfare) and withheld income tax, annualized by the civil year,
  because no monthly income accumulator exists. **A trailing-month income average
  is not implemented**; the GDD does not define that measurement window. This
  limitation is recorded in `DECISIONS.md`.
- M3f first attempts full desired production demand, then falls back to
  opening-cash-capped production demand if settlement would be unfunded. The
  fallback is safe but can underuse valid same-batch sales receipts; it is
  reported as `fallbackUsed`.
- M3f stages each economic day with a structural deep clone for whole-day
  atomicity. The clone is schema-specific and must be extended when authoritative
  state gains fields; this is a correctness mechanism, not evidence of mobile
  performance.
- M5 implements shared/trade-connected markets only through shared market
  membership. It does not implement inter-market physical trade, tariffs,
  cross-market transport charges, or a rest-of-world external-trade account, and
  it does not add M5b debt/deficit financing.
- M5a distributes only positive retained profit and is capped by actual operating
  cash. It is a provisional scenario policy (default disabled for legacy
  fixtures); it does not add dividend/corporate/capital-gains taxes, securities
  markets, share issuance/trading, banking, debt, deficit financing, or arbitrary
  player/AI distribution controls. The shipped historical sample has no state-owned
  building instances, so state remittances are exercised by focused fixtures rather
  than the eight-polity campaign. State remittances are not income-tax revenue.
- M5b debt is held only by another country treasury or a pop-block household cash
  account. It does not add commercial banking, deposits, a central bank, monetary
  issuance, bond-market pricing, derivatives, external investors, a debt-to-GDP
  target, debt auctions, or player/AI debt actions. Automatic financing covers the
  accrued month-end deficit, not an intra-month welfare liquidity shortage;
  interest is not taxed. The full campaign is projected, not executed.
- M5 migration is limited to existing same-profession destination blocks, happens
  monthly, and uses provisional vacancy/wealth pressure and absorption
  coefficients. It does not implement profession promotion/demotion, a free
  migration pool, remittances, or border-law enactment. `immigrationOpen` is a
  scenario policy flag, not an M8 law.
- M5 historical data is a provisional eight-polity sample, not a world total or a
  full historical reconstruction. Population targets are rounded source-referenced
  estimates; occupation structure, age structure, regional splits, literacy/
  wealth, fiscal settings, building levels, and market groupings are provisional.
  Century-scale population/occupation-trend calibration is **not claimed** because
  the M3 recipes/needs are not historically calibrated and profession transition
  is not implemented.
- M5's full 36,524-tick economic campaign was projected from a measured sample in
  the M5 benchmark; M6 executes it only in the opt-in
  `pnpm run bench:campaign` mode, not in `pnpm run ci`. Mobile performance remains
  **NOT EVALUATED**.
- M6 AI is a provisional rule-based fiscal governor, not a full planner. It can
  only set income tax and the welfare budget. Construction queues, infrastructure
  and production priorities, laws, debt actions, diplomacy, military actions, and
  AI randomness are not implemented. Its thresholds are provisional policy
  heuristics, not calibrated behavior; it never lowers income tax in v1, and its
  pre-close revenue basis is unknown rather than estimated.
- M6's full-campaign measurement showed the pre-close trial balances retained for
  every closed month dominating save size: 18.76 MiB at the M6 baseline. Batch 3
  (D-065) retains 12 detailed monthly trial balances and compacts older months to
  exact per-country fiscal/flow totals. The equivalent 1,200-summary fixture now
  measures **2.04 MiB canonical**; the full campaign was not rerun. The M6 18.76
  MiB row is retained as the before measurement.
- The M6 full-campaign benchmark is a Node diagnostic and does not measure mobile
  frame rate, device memory, battery, or release-build tick time.
- **M7 native release builds and real-device performance are not verified.** There
  is no Xcode/Android SDK/emulator or named reference device in the execution
  environment. Expo web export and iOS/Android Hermes JS bundles exist, but a JS
  bundle is not a release build. M7 carries a documented acceptance exception.
- The M7 map is a 16-region vector-grid prototype, not the 500-region production
  map; pan/zoom, country geometry, occupation overlays, and broad annual charts
  are absent. Charts are limited to a net-fiscal history strip.
- Snapshot delivery is capped at one per 100 ms and can lag when a tick takes
  longer. The Node worker-host tick+snapshot p95 was 80.46 ms; mobile FPS and
  responsiveness are unmeasured.
- M7 compressed saves only at the AsyncStorage boundary. At the M6 baseline the
  canonical full-campaign save was 18.76 MiB. Batch 3 (D-065) now compacts history
  older than 12 months; the bounded 1,200-summary fixture is 2.04 MiB canonical.
  The full campaign and a device were not rerun/tested.
- The native WebView transport is a proof of concept; no native worker package or
  release configuration was adopted.

## M6 completion report

### 1. Exact M6 scope and GDD acceptance criteria

The then-authoritative GDD v2.5 §17 assigns M6: **deterministic country AI v1, action
validation, stress testing, and a simulation performance report**. Its definition
of done is: the AI can govern the sample world without invalid actions or
hidden-information access; a full-campaign benchmark reports p50/p95/p99; there is
no unbounded state growth; and performance bottlenecks are identified.

### 2. Features implemented and explicit exclusions

Implemented: persisted AI enable policy and fixed-size per-country schedule/goal
state; seven-day staggered evaluation by stable country id; a pure decision
function over an own-country/public observation; solvency-before-relief fiscal
rules; the shared `set-fiscal-policy` player/AI action with atomic validation and
application; AI action diagnostics; sample-world AI enablement; AI-enabled
representative and stress benchmarks; an opt-in full-campaign benchmark; and
bounded hot-path summary validation.

Excluded: construction/building queues, infrastructure or production priorities,
laws, debt actions, diplomacy, military actions, AI randomness, hidden-information
access, AI tax cuts, annual close, UI, and any new money source, tax, expenditure,
or posting kind.

### 3. Important design decisions and integration behavior

D-058 records the AI rules, observation boundary, cadence, persistence, shared
validator, failure behavior, and non-goals. D-059 records the tick-path validation
and immutable-summary clone optimizations. AI runs at pipeline step 2 before
ageing/demography and market phases; its policy changes therefore affect the same
day exactly as a player policy change made at the previous tick boundary. The AI
phase participates in whole-day staging: a later phase failure discards the AI
action with the rest of the day. AI does not touch finance accounts or postings;
only `Country.fiscal` and `Country.ai` change.

### 4. Tests, CI results, and benchmarks

The full test suite has **502 tests in 41 suites** and passes. It adds 13 focused
M6 tests covering cadence, hidden information, decision boundaries, shared
validation, atomic rejection, deterministic replay, save/resume, zero invalid
actions, bounded state growth, immutable-summary sharing, malformed AI state, and
the summary-validation boundary. The bounded M6 sample ran at p50 `83.02 ms` /
p95 `94.34 ms`, the AI stress fixture at p95 `200.8 ms`, and the full campaign at
p50 `144.3 ms` / p95 `185.8 ms` / p99 `1,024.0 ms` on the recorded Node machine.
`pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run bench`, and
`pnpm run ci` results are recorded below. Full workloads are in
[the benchmark section](#benchmark-scope-and-recorded-node-results).

| Command | Result |
|---|---|
| `pnpm run lint` | PASS, exit 0: boundary checks passed (106 TypeScript files, 45 in `packages/sim`) |
| `pnpm run typecheck` | PASS, exit 0: all five workspace packages |
| `pnpm test` | PASS, exit 0: 41 suites, 502 tests |
| `pnpm run bench` | PASS, exit 0: all M1–M6 gates |
| `pnpm run bench:campaign` | PASS, exit 0: 36,524 ticks, terminal reached, bounded state, zero invalid actions |
| `pnpm run ci` | PASS, exit 0: lint, typecheck, 502 tests, benchmark (CI test time 493.2 s) |
| `git diff --check` | PASS: no whitespace errors (CRLF conversion notices only) |

### 5. Commit hashes and parent relationships

- Implementation commit: `f321c01432a55858a07e0ccc9e2c6acac4ffbc09`
  (`feat: implement M6 deterministic country AI and action validation`). Its
  parent is the accepted M5b HEAD
  `cc7d9aa759f00618bbd77f993a617b1e2059eef0`.
- Documentation commit: the immediate child of `f321c01` containing this report,
  `README.md`, `DECISIONS.md`, `Century_GDD_v2.5.md`, and the data README. Its
  exact hash is reported in the handoff accompanying this milestone; a commit
  cannot embed its own hash.

### 6. Schema/version changes and save compatibility

World schema **13**, simulation version **0.13.0**, save format **1**, data version
`m3-economy-v1`. The new hashed state is `World.countryAI` and `Country.ai`;
known-answer digests are re-baselined. Schema-12/simulation-0.12.0 saves are
rejected with an actionable error and no migration. Older incompatible saves remain
rejected; no migration policy changed.

### 7. Known limitations, calibration, and unmeasured performance

The AI is a provisional fiscal governor, not a planner; its thresholds are
uncalibrated policy heuristics. It has no construction, law, debt, diplomatic, or
military action and never lowers income tax in v1. The eight-polity historical
sample is still provisional and not a world total. At the M6 baseline the
full-campaign save was **18.76 MiB** because M4b retained one pre-close trial
balance per month. Batch 3 compacts summaries older than 12 months to exact
per-country fiscal/flow totals; the bounded 1,200-summary fixture measures
**2.04 MiB canonical**. The full campaign was not rerun. Node benchmark timings are
diagnostics; mobile performance and the mobile p95 ≤ 8 ms target remain **NOT
EVALUATED**.

### 8. Final repository state

Branch `main`. The implementation HEAD is
`f321c01432a55858a07e0ccc9e2c6acac4ffbc09`; its parent is the accepted M5b HEAD
`cc7d9aa759f00618bbd77f993a617b1e2059eef0`. The documentation commit is the
immediate child and is the final HEAD reported in the handoff. The working tree is
clean after both commits, and no later milestone is started.

## M7 completion report

### 1. Source-defined scope and acceptance criteria

The then-authoritative GDD v2.5 §17 assigns M7: **mobile worker proof of concept and
playable app — map, snapshot bus, five core screens plus map**. Its definition of
done is: a release build runs on iOS and Android; pause/speed/actions/save/load
work; the UI reads snapshots only; target frame rate and on-device tick
performance are measured and reported. GDD §13 specifies the map, charts, six
screens, readability, and snapshot data flow; §14.2–§14.5 specify the worker proof,
versioned protocol, performance targets, and state boundary.

### 2. Implemented functionality and explicit exclusions

Implemented: `packages/sim-worker` protocol version 1; `SimulationHost`; bounded
immutable snapshots; Web Worker, hidden-WebView, and Node worker-thread
transports; the six screens; start/pause/step/speeds; fiscal-policy player action
through the shared validator; gzip/AsyncStorage save/load; app worker-bundle
generation; M7 worker benchmark; and app/worker tests.

Excluded: native release builds and real-device measurement; the 500-region
production map and pan/zoom; broad annual charts; annual close, laws, technology,
diplomacy, warfare, construction, and later-milestone simulation systems; any new
authoritative simulation state or save-compatibility change.

Key files: [`packages/sim-worker/src/protocol.ts`](./packages/sim-worker/src/protocol.ts),
[`host.ts`](./packages/sim-worker/src/host.ts),
[`snapshot.ts`](./packages/sim-worker/src/snapshot.ts),
[`persistence.ts`](./packages/sim-worker/src/persistence.ts),
[`webWorkerEntry.ts`](./packages/sim-worker/src/webWorkerEntry.ts),
[`nodeWorkerEntry.ts`](./packages/sim-worker/src/nodeWorkerEntry.ts),
[`App.tsx`](./packages/app/App.tsx),
[`SimulationProvider.tsx`](./packages/app/src/worker/SimulationProvider.tsx),
[`NativeWorkerHost.tsx`](./packages/app/src/worker/NativeWorkerHost.tsx),
the six screen files in `packages/app/src/screens`, `m7Bench.ts`, `m7-worker.test.ts`,
and the generated worker bundle/scenario.

### 3. Important design decisions

D-060 records the protocol, snapshot bus, transports, tick-boundary command
application, action path, save-storage codec, generation, and failure behavior.
D-061 records the Expo stack, six-screen scope, map prototype, compressed storage,
and the explicit native/device acceptance exception. The app imports only the
worker protocol/snapshot/selector/storage contracts; an architecture test rejects
`@century/sim`/`@century/data` imports and direct simulation helpers.

### 4. Integration with completed milestones

The worker reuses the existing `tick`, canonical serializer, `hashWorld`,
`validateCountryAction`, `applyCountryAction`, `governmentPeriodTotals`, and
country/AI state. No simulation behavior changed. The M7 app action goes through
the same player/AI validator as M6. The UI never reads or mutates the live world;
it receives only snapshots. Saves retain schema 13/simulation 0.13.0 and are
compressed only after serialization.

### 5. Tests, CI, and performance results

The suite has **510 tests in 42 suites** and passes. It adds 8 M7 worker tests
covering bounded frozen snapshots, no world internals, step/pause/speed,
valid/invalid actions, atomic load failure, determinism, shutdown, selectors, and
save compression, plus the app-boundary architecture test. Results:

| Command | Result |
|---|---|
| `pnpm run lint` | PASS, exit 0 — boundary checks now exclude `packages/sim-worker` from the pure-sim prefix |
| `pnpm run typecheck` | PASS, exit 0 — sim, data, worker, tests, app, bench |
| `pnpm test` | PASS, exit 0 — 42 suites, 510 tests |
| `pnpm run bench` | PASS, exit 0 — all M1–M7 gates |
| `pnpm run app:export` | PASS, exit 0 — web + iOS + Android JS/Hermes bundles |
| `pnpm run ci` | PASS, exit 0 — lint, typecheck, 510 tests, benchmark, app exports |
| `git diff --check` | PASS — no whitespace errors |

Node M7 worker results: tick+snapshot p95 `80.46 ms`; snapshot `11.8 KiB`; save
`353.5 KiB` → `72.2 KiB` compressed. Headless Chromium Pixel 5 interaction passed
start/pause/step, fiscal action, save/load restoring the saved day/policy, and
month-end ledger rendering with zero page errors. The simulated
ReactNativeWebView bridge probe passed. These are not device results.

### 6. Commits and parent relationships

- Implementation commit: `42151ec1d594cec440fa0d7944d6dcea0d42412d`
  (`feat: implement M7 worker protocol and playable Expo shell`). Its parent is
  the accepted M6 HEAD `d3c2c921f26ae6268811dc29966acdaacff78ca3`.
- Documentation commit: the immediate child of `42151ec` containing this report,
  `README.md`, `DECISIONS.md`, `Century_GDD_v2.5.md`, and the app/sim-worker
  README files. Its exact hash is reported in the handoff; a commit cannot embed
  its own hash.

### 7. Schema/version changes and save compatibility

No simulation schema/version change **at the M7 baseline**. World schema was
**13**, simulation **0.13.0**, save format **1**, data version `m3-economy-v1`.
**Superseded by the post-M7 remediation (D-062/D-063, D-065, D-066):** schema
**16**, simulation **0.16.0**, data version `m3-economy-v3`, save format still
**1**.
Worker protocol version **2** at M7 completion (now **4** after E1's and M7a's additive
snapshot fields) is independent of the save schema. The app's gzip storage wrapper preserves the
canonical save string and therefore its checksum, hash, validation, and
compatibility. Older incompatible simulation saves still reject.

### 8. Known limitations and unmet acceptance criteria

- **Native iOS/Android release builds are not produced and real-device
  performance is not measured.** This is an explicit M7 acceptance exception:
  release build, target frame rate, cold start, memory, battery, and on-device
  tick p95 remain **NOT EVALUATED**. The vertical slice is not claimed complete.
- The map is a 16-region vector grid; 500-region geometry, pan/zoom, and broad
  annual charts are absent.
- Snapshot delivery is rate-limited and can lag; Node tick+snapshot p95 is far
  above the mobile 8 ms target.
- The M6 18.76 MiB canonical save is addressed by Batch 3 compaction (2.04 MiB on
  the bounded 1,200-summary fixture); the full campaign and device storage were not
  rerun/tested.
- The historical sample remains provisional; AI is still a fiscal governor.
- Node/browser results are diagnostics, not mobile evidence.

### 9. Final repository state

Branch `main`. The implementation HEAD is
`42151ec1d594cec440fa0d7944d6dcea0d42412d`; its parent is the accepted M6 HEAD
`d3c2c921f26ae6268811dc29966acdaacff78ca3`. The documentation commit is the
immediate child and is the final HEAD reported in the handoff. The working tree is
clean after both commits. M7 is delivered with the documented native/device
acceptance exception; M8 and later milestones are not started.

## Post-M7 remediation batch 1 — scenario feasibility and player agency

**Scope.** This batch implements D-062 and D-063. It does not start M8, does not
enable public debt, and does not change the worker transports, save compression,
speed controls, or native code.

### Root causes confirmed and fixed

The audit confirmed that the shipped eight-polity sample combined the legacy M3
catalog with historical building instances that had **no fishery or ranch**, while
the needs catalog required fish and livestock every day. Grain capacity was ~65% of
the authored 0.9 kg/capita/day need, food-products ~9%, and clothing ~12% of
basic+comfort demand. Separately, every legacy recipe had negative net value at
base prices and base wages, and the sample had no designated player country while
the AI governed all eight polities.

The historical scenario now uses a separate provisional catalog
(`historical_goods.json`, `historical_buildings.json`,
`historical_professions.json`, `historical_needs.json`). The legacy M2–M4
baseline catalog is unchanged and its tests still pass.

### Capacity versus need (world totals, nominal units/day)

| Good | Before capacity | Before need | After capacity | After need |
|---|---:|---:|---:|---:|
| Grain (household + processing input) | 380.8 M | 998.2 M (583.4 household + 414.9 processing) | 381.5 M | 380.9 M |
| Food products | 4.65 M | 51.9 M | 19.66 M | 19.45 M |
| Fish | 0 | 19.4 M | 19.5 M | 19.4 M |
| Livestock | 0 | 19.4 M | 19.5 M | 19.4 M |
| Clothing (basic + comfort) | 0.75 M | 7.78 M | 6.55 M | 6.48 M |
| Textiles (clothing input + luxury) | 1.65 M | 14.26 M | 4.62 M | 4.57 M |

“Before” grain and textile need include the input required to satisfy the full
authored final demand; the legacy capacity could not process that demand in the
first place, which is the defect. The per-market checks are stricter than these
world totals: each market's own population, processing inputs, and building stock
must cover that market's demand.
The shipped scenario has 113 building instances (81 prior + 16 ranches + 16
fisheries) and 316 initial employment assignments.

### Recipe economics

All seven legacy recipes were negative at base prices and wages, from −0.34 to
−1.00 SUSD per worker-day. The historical catalog is positive at **both** base
prices and the opening lower-bound prices for every recipe. Examples at base
prices per throughput unit: subsistence farm +33,390; commercial farm +49,753
(laborer variant) / +57,425 (peasant variant); ranch +29,534; fishery +27,945;
food processing +24,377; textile mill +34,220; workshop +60,613 (laborer variant)
/ +62,531 (peasant variant). The feasibility test recomputes these from the
validated definitions rather than hardcoding the table.

Provisional calibration choices:

- Needs: grain 0.527, food-products 0.03, fish 0.03, livestock 0.03 kg/capita/day;
  basic clothing 0.01 and comfort clothing 0.002 garments/capita/day.
- Recipes: higher output per worker, a 2:1 grain-to-food process, value-added
  textile/clothing prices, and peasant/laborer variants where local labor
  composition requires them.
- Levels: per-market totals sized to that market's demand, distributed across
  regions in proportion to regional population.
- Opening prices: `0.25 × base` (the documented lower bound), so a fixed-capacity
  market does not drift below the price floor when opening stock is present.
- Opening intermediate stock: one day of grain, cotton, wool, and textiles,
  attributed to in-market producer buildings. This supplies the one-day
  production-chain lag; there is no inter-market trade.
- Operating cash: three days of wage cover for input-using buildings; smaller
  buffers for farms/ranches/fisheries, which sell on the same day.
- Participation/wages: peasants 0.60/60 SUSD/yr, laborers 0.40/130, clerks
  0.55/250; private payout rate 1.0 to avoid stranded retained cash without an
  investment system.

These are structural feasibility assumptions, **not** historical calibration.

### Player-country mechanism

The historical scenario designates the USA (`playerCountryTag: "USA"`, id 0).
`World.playerCountryId` is authoritative, serialized, hashed, and included in the
snapshot. `runCountryAIPhase` skips exactly that country; AI-controlled countries
continue through the unchanged observation/validator/application path. The app
selects the player country by default, marks Budget/Country context, and disables
fiscal edits for AI-controlled countries. The player still uses the shared
`validateCountryAction`/`applyCountryAction` path.

Regression coverage: `m6-player-country.test.ts` asserts the designation, applies
a player action, advances through the country's scheduled AI evaluation, confirms
the policy is unchanged, confirms AI countries are still evaluated, and verifies
save/load plus deterministic replay preserve the configuration. `m3d-market.test.ts`
adds the Pass-B eligibility regression that the first-day/stockout scenario needed.

### Verification results

Commands executed:

- `pnpm run lint` — PASS (125 TypeScript files, 45 in `packages/sim`).
- `pnpm typecheck` — PASS (all six workspace packages).
- `pnpm test` — PASS: **44 suites, 518 tests**.
- `pnpm run bench` — PASS in the final CI run. Representative results:
  - M1 36,524 ticks: 0.002–0.004 ms avg, hashes equal.
  - M2 world aggregate 36,524 ticks: ~0.10 ms avg, p95 ~0.18 ms, hash
    `0731b26b151efb09`.
  - M2 200-block stress: p50 3.47 ms, p95 **4.70 ms** (provisional ≤5 ms gate
    satisfied; earlier runs varied as high as 5.15 ms and failed that provisional
    gate).
  - M5 eight-polity sample: p50 **182.4 ms**, p95 **205.2 ms**, 113 buildings,
    population 648,229,543; projected full campaign ~1.80 h (not executed).
  - M6 sample: p50 182.6 ms, p95 193.2 ms, 14 evaluations, **1 applied** action,
    0 rejected. The benchmark seeds a benchmark-only fiscal stress on one
    AI-controlled country so the `applied > 0` gate exercises the real path; this
    does not change the shipped scenario.
  - M7 worker host: complete tick+snapshot p95 **220.2 ms**, snapshot 11.7 KiB,
    save 413.1 KiB → 80.2 KiB compressed.
- `pnpm run ci` — PASS, exit 0 (lint, typecheck, 518 tests, benchmark, web/iOS/
  Android Expo exports).
- `git diff --check` — PASS.

The full 36,524-tick campaign was **not** rerun after D-062. The previously recorded
85,487,776 final population belongs to the pre-remediation scenario and must not be
quoted as the current outcome. The bounded 31-day feasibility run shows no
world-level famine: under 10% of population remains in blocks with an unmet
subsistence counter, and total population does not decline by more than 0.5%.
Some clerk/capitalist blocks in Russia/India/Brazil remain cash-constrained; this is
recorded as a remaining income-distribution calibration limitation, not a capacity
pass.

### Schema, data version, and save compatibility

- Batch 1 values were `WORLD_SCHEMA_VERSION` **14** and `SIM_VERSION` **0.14.0**.
  **Superseded by Batch 3/Batch 4:** schema **16** and simulation **0.16.0**.
- Batch 1 `DATA_PACKAGE_VERSION` was **`m3-economy-v2`**; Batch 4 changes the
  scenario fiscal/debt meaning and moves it to **`m3-economy-v3`**.
- Save format remains **1**; envelope/checksum logic is unchanged.
- Saves from schema 13 / sim 0.13.0 / data `m3-economy-v1` are intentionally
  rejected rather than loaded under different definitions. There is no migration.
- Generated `m5Scenario.ts` and the app worker bundle were regenerated.

### Remaining limitations

- Per-block income distribution is not calibrated: some clerk/capitalist blocks are
  still cash-constrained in the bounded run. Construction, profession transition,
  inter-market trade, and government procurement do not exist yet.
- The full campaign has not been rerun; century-scale population/occupation
  behavior is unverified. No historical calibration claim is made.
- M5 sample tick cost rose with the 113-building scenario (~180–205 ms/tick in the
  final run; projected 1.8–2.0 h for the campaign). This worsens the existing
  speed-control/performance limitation; mobile remains unmeasured.
- Batch 1 left public debt disabled in the shipped scenario. Batch 4 (D-066) now
  enables it for the USA player country only; the historical note is retained for
  the Batch 1 state.
- Save-size/worker-reliability/speed-control remediation batches are not included.
- Native release builds and real-device performance remain **NOT EVALUATED**.

### Commits

Implementation commit: `f7fedbe6045d0f28ac54f8b60019518ba8a8ba18`
(parent `c528240160de6281e9c0e44a2e38b13302db811d`). Documentation commit: the
immediate child containing this section, `DECISIONS.md`, and
`Century_GDD_v2.5.md`. The final HEAD is reported in the handoff.

## Post-M7 remediation batch 2 — worker reliability and pacing

**Scope.** D-064 implements the Batch 2 worker/pacing findings only. It does not
change tick semantics, economic calculations, save format/size, debt, speed-control
design, worker transports, or native code. Standard CI was run; the full campaign,
stress/soak tests, and native release builds were not.

### Pacing policy

- A pump accepts at most **1,000 ms** of elapsed wall time, retains at most
  **1,000 ms** of backlog, and executes at most **4 ticks**.
- A suspended tab/WebView therefore cannot replay minutes or years. A 60-second
  stall advances at most one second of simulated wall time and no more than four
  ticks in the first burst.
- `START`, `PAUSE`, `STEP`, `LOAD`, and `SET_SPEED` discard outstanding backlog.
  Pause stops the timer; step is exact; load pauses and requires explicit Start; a
  speed change applies only forward.
- Web pauses on `visibilitychange`/hidden and resumes only if it was running before
  hiding. Native uses `AppState` `background`/`inactive` and resumes on `active`
  under the same condition. The host clamp remains the fallback if a lifecycle event
  is missed.
- The selected days/second is a **target**, not a guarantee. Snapshots include a
  rolling 500 ms `achievedDaysPerSecond` and `speedIsBestEffort: true`; the UI shows
  “Target … · ~actual actual · best effort”.
- Terminal behavior is preserved: Start at 2000-01-01 is rejected with
  `campaign_complete`, Step does not advance, Load remains available.

### Supervision, correlation, and recovery

- `WorkerSupervisor` (transport-independent, in `@century/sim-worker`) enforces a
  **10 s readiness timeout**, **15 s ordinary command timeout**, and **60 s
  save/load/apply timeout**.
- Commands and replies are correlated by `commandId`. Pump snapshots use
  `commandId: null`; requested snapshots echo the request. Duplicate and late
  replies are dropped after a command settles or times out.
- Only one save/load/apply critical operation can be in flight. Save/Load/Apply
  controls are disabled while busy; a second critical request is rejected with a
  clear message.
- Snapshot sequences must be strictly newer. The high-water mark resets with a
  replacement worker.
- Timeout, transport error, malformed message, `FATAL`, or native WebView process
  termination clears pending operations/status, marks the connection failed, and
  shows **Restart worker**.
- Restart creates a fresh 1900 simulation context. **Unsaved in-memory progress is
  lost**; the UI states that and directs the player to load a saved game. No
  automatic recovery of lost state is claimed.
- Native callbacks `onRenderProcessGone` and `onContentProcessDidTerminate` route
  into the same failure path. This is wiring, not device verification.

### Protocol and snapshot hardening

- Worker protocol is now **version 2**. Version 1 clients are intentionally
  incompatible; the app and bundled worker are rebuilt together.
- `STATE`/`SNAPSHOT` carry nullable command correlation; `ACTION_RESULT` and
  `SHUTDOWN` are correlated; `STATE`/snapshots carry achieved-speed telemetry.
- Snapshot validation now checks the fields the UI dereferences: civil date,
  country fiscal/finance history, regions and nullable country/market ids, goods,
  market prices, diagnostics, player-country reference, and speed telemetry.
  Malformed messages are rejected before rendering.
- `AppErrorBoundary` contains screen-render failures; the header and controls stay
  usable, and the fallback offers Retry rendering and Restart worker.
- UI code still imports only public `@century/sim-worker` contracts, not
  `@century/sim` or `@century/data`.

### Tests and verification

Commands actually executed:

- `pnpm run lint` — **PASS** (128 TypeScript files, 45 in `packages/sim`).
- `pnpm typecheck` — **PASS** (all six workspace packages).
- `pnpm test` — **PASS: 46 suites, 534 tests**.
- `pnpm run ci` — **PASS, exit code 0**: lint, typecheck, 534 tests, standard
  benchmark, and web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

New/extended tests:

- `m7-worker.test.ts`: 60 s stall bounded; pause/resume and speed-change debt
  discard; terminal Start/Step; command correlation; existing save/load,
  determinism, malformed-command, and compression tests.
- `m7-supervisor.test.ts`: readiness timeout, command timeout, duplicate/late
  replies, strictly newer snapshots, one-critical lock, reset/dispose, transport
  failure clearing, parser rejection of malformed nested snapshot data.
- `m7-app-lifecycle.test.ts`: source-level wiring guards for native process-failure
  callbacks, AppState/visibility pause-resume, restart, status clearing, and the
  error boundary. These are not native runtime tests.

Final CI benchmark (standard `pnpm run bench`, PASS):

| Workload | Result |
|---|---|
| M1 36,524 ticks | 0.002–0.004 ms avg; equal hashes |
| M2 aggregate | ~0.10 ms avg, p95 ~0.18 ms |
| M2 200-block stress | p50 3.44 ms, p95 **4.47 ms** (provisional ≤5 ms gate satisfied) |
| M5 eight-polity sample | p50 **210.5 ms**, p95 **274.4 ms**, 113 buildings; projected campaign **2.19 h** (not executed) |
| M6 sample | p50 238.5 ms, p95 327.1 ms; 14 evaluations, 1 applied, 0 rejected |
| M7 worker host | tick+snapshot p50 **229.4 ms**, p95 **470.9 ms**; snapshot 11.8 KiB; save 413.1 KiB → 80.2 KiB compressed |
| M7 save codec | 43.69 ms avg compress+decompress |

These are Node diagnostics under current machine load, not mobile evidence. The
M5/M6/M7 numbers shifted from the previous report; no tick logic was changed in
this batch, so this is not presented as a throughput improvement or regression
claim.

### Remaining limitations

- Native release builds and physical-device behavior are **NOT VERIFIED**. The
  `AppState`, WebView process-termination, and visibility paths compile and are
  source-guarded, but cannot be proven on device here.
- There is no automatic restoration of unsaved in-memory state after a worker
  restart. Restart begins a fresh 1900 world; only saved games can be reloaded.
- The selected days/second remains best-effort; no guarantee of sustained target
  throughput is made. General performance optimization is out of scope.
- Save compression/size, autosave, storage quotas, history compaction, public debt,
  worker transport replacement, and economic calibration were out of scope for
  Batch 2/3; Batch 4 separately addresses debt activation and bounded contracts.
- The full 36,524-tick campaign and stress/soak tests were not run in this batch.

### Commits

Implementation commit: `8bbd0ec8275f5697a408b062802b77acc39f3bc8`
(parent `7c5463474dd553a8605bedf61b0975047aab43b9`). Documentation commit: the
immediate child containing this section, `DECISIONS.md`, and
`Century_GDD_v2.5.md`. The final HEAD is reported in the handoff.

## Post-M7 remediation batch 3 — save size, persistence, and campaign recovery

**Scope.** D-065 addresses the save-size and persistence findings only. It does
not change simulation mechanics, public debt, worker transports, speed controls, or
general performance. The full 36,524-tick campaign was not rerun; a bounded
representative fixture was used.

### Root cause and target

The canonical save is dominated by **`FinanceState.periodSummaries[].accountTotals`**:
M4b kept a complete pre-close trial balance for every one of up to 1,200 months.
At the current scenario’s ~1,210 accounts, 863 nonzero totals per month, and 256
postings, the representative 1,200-summary fixture measured:

- **23.25 MiB canonical** (before compaction)
- 323.8 KiB in the synthetic repeated-value compressed representation

The GDD 4 MiB target is interpreted as the **canonical uncompressed save string**.
Compressed/base64 storage is a separate size and is not used to claim the target.
The early-save compression ratio is not extrapolated to late game.

### Compaction policy and measured result

The most recent **12** monthly summaries retain the full account trial balance
(the same 12-month window the Ledger snapshot uses). Older summaries retain:

- period start/end dates for all 1,200 months;
- the four exact gross flow totals;
- exact per-country income-tax, welfare, interest, and net fiscal totals.

`accountTotals` is empty for compacted summaries. No values are rounded. The
compaction is a deterministic state transformation at month close; the latest
summary remains fully detailed for the profit-allocation phase.

Equivalent 1,200-summary fixture, after compaction:

| Measure | Result |
|---|---:|
| Detailed / compacted summaries | 12 / 1,188 |
| Canonical save | **2.04 MiB** (2,141,048 bytes) |
| Stored gzip+base64 representation | **105.5 KiB** (108,059 bytes; synthetic repeated values compress favorably) |
| Base64 payload | 108,040 bytes |
| gzip / gunzip | 55.6 ms / 23.0 ms |
| Canonical `deserializeWorld` | 116.8 ms |
| Round-trip | byte-equal, equal world hash |
| Save date / schema | 2000-01-01 / 15 |

This meets the canonical 4 MiB target for the bounded fixture. The full campaign
was **not** executed, so 2.04 MiB is not presented as a measured full-campaign
result. The trade-off is explicit: account-level monthly trial balances older than
12 months are no longer retained; exact government fiscal totals, gross flows, and
monthly dates are.

### Replace-safe storage and recovery

`SaveStore` in `@century/sim-worker/persistence` now:

1. compresses the canonical save and writes a **staging** key;
2. reads staging back and verifies it;
3. copies the old primary to a **previous** key only if it is readable;
4. writes and verifies the **primary** key;
5. removes staging only after primary verification.

On load, candidates are tried in order **primary → staging → previous**. A failed
staging/primary write leaves the old primary intact; a corrupt primary can recover
a fully written staging copy or the previous valid save; incompatible schema/format
saves are rejected. AsyncStorage cannot provide a true cross-key transaction, so
the staging/previous keys are the documented recovery boundary. Storage failures
are asserted and reported; a failed save never reports success.

### Campaign lifecycle and autosave

- Startup reads only envelope metadata (no world) and shows **Continue** or **New
  Game** with the saved date, scenario, sim/schema version, and canonical/stored
  size.
- **New Game** warns that it starts a fresh world. The old save is preserved, and
  autosave is disarmed until an explicit save. Saving over the existing campaign
  requires a second confirmation; the previous valid save remains as a recovery
  copy.
- **Continue** loads the selected saved campaign; a failed load leaves the fresh
  world intact and the save untouched. A recovered previous/staging save is labeled
  in the choice screen.
- Autosave triggers at safe points: a completed Pause and app backgrounding. It is
  debounced **500 ms**, coalesces repeated requests into at most one pending save,
  and is suppressed while a save/load/action is already pending. It is not a
  guarantee of background completion on a suspended runtime.
- Autosave success is shown only after storage verification (`Autosaved <date> ·
  …`); failure is shown as `Autosave failed: …`. The UI distinguishes these from
  manual `Saved …` status.
- Worker restart still loses unsaved in-memory state and directs the player to load
  a saved game. No recovery of lost in-memory state is claimed.

### Verification

Commands actually executed:

- `pnpm run lint` — **PASS** (132 TypeScript files, 45 in `packages/sim`).
- `pnpm typecheck` — **PASS** (six workspace packages).
- `pnpm test` — **PASS: 49 suites, 552 tests**.
- `pnpm run ci` — **PASS, exit code 0**: lint, typecheck, 552 tests, standard
  benchmark, web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

New tests:

- `m4b-save-compaction.test.ts`: 12/1188 split, exact country totals, real close
  path, canonical <4 MiB, equal round-trip hash, large compression, worker-protocol
  LOAD, malformed compact summary rejection.
- `m7-save-store.test.ts`: metadata/date, store/load, injected primary-write failure
  preserving old save, corrupt-primary fallback to previous, staging recovery,
  incompatible-schema rejection, truncated payload rejection.
- `m7-autosave.test.ts`: 500 ms debounce/coalescing, unsafe-save suppression and
  fire-time recheck, cancel/dispose without late saves.
- `m7-app-lifecycle.test.ts`: source-level startup/Continue/New Game, overwrite
  confirmation, autosave feedback, and storage-schema wiring guards.
- Serialization/hash assertions updated for schema 15; existing save/load,
  checksum, player-country, and deterministic-continuation tests still pass.

Final CI benchmark (standard `pnpm run bench`, PASS): M5 sample p50 182.5 ms / p95
205.7 ms, projected full campaign 1.79 h (not run); M6 sample p50 182.0 ms / p95
197.7 ms; M7 tick+snapshot p50 180.3 ms / p95 183.7 ms, snapshot 11.8 KiB, early
save 413.1 KiB → 80.2 KiB. These are Node diagnostics under current load, not
mobile evidence.

### Compatibility and versioning

- Batch 3 values were schema **15**, simulation **0.15.0**, data
  `m3-economy-v2`. **Superseded by Batch 4:** schema **16**, simulation **0.16.0**,
  data `m3-economy-v3`. `SAVE_FORMAT_VERSION` remains **1** (envelope shape
  unchanged).
- Schema-14 and older saves are **rejected explicitly**, not silently
  reinterpreted. There is no migration.
- The app’s `SUPPORTED_SAVE_SCHEMA_VERSION` is 15 and must be updated with the
  simulation schema.

### Remaining limitations

- Web AsyncStorage/localStorage quota behavior and native AsyncStorage/bridge
  behavior were **not** tested on a device. The storage tests use an in-memory
  backend with injected failures.
- The canonical late-game save crosses the native bridge as one SAVE_RESULT string
  (~2.14 MB in the fixture); no chunked/file-backed transfer was added because the
  compacted payload is bounded and no device evidence justified that complexity.
  Actual native bridge limits remain **unverified**.
- The full campaign was not rerun; the 2.04 MiB result is from the bounded
  representative fixture.
- Autosave is best-effort. A runtime that suspends JavaScript before the debounced
  save executes can lose progress since the last verified save.
- Account-level trial balances older than 12 months are intentionally not retained.
- Save compression/size work beyond this compaction, autosave slots, storage
  quotas, debt, and general performance remain out of scope.

### Commits

Implementation commit: `3fcd18253a6b3f9bd98d0177e47d7aa96134f84e`
(parent `d4e5488f1d44c784b4c2061897c3e3d4040d49d7`). Documentation commit: the
immediate child containing this section, `DECISIONS.md`, and
`Century_GDD_v2.5.md`. The final HEAD is reported in the handoff.

## Post-M7 remediation batch 4 — public debt, financing, and bounded contracts

**Scope.** D-066 activates public debt in the shipped playable policy, corrects the
financing requirement for cash and unpaid welfare, and bounds contract storage. It
does not start another milestone or change unrelated simulation mechanics.

### Debt activation

Exactly one polity, the USA player country, has debt enabled in the shipped
scenario:

| Input | Value |
|---|---:|
| Welfare budget | 2,000,000 SUSD/year |
| Opening treasury | 100,000 SUSD |
| Creditor | GBR country treasury (id 1) |
| Annual coupon | 4% |
| Term | 365 civil days |
| Outstanding ceiling | 1,000,000 SUSD |
| Refinance on maturity | true |
| Arrears grace | 365 days |

The other seven countries remain disabled. The USA is exempt from AI fiscal
decisions, so its authored policy is not silently overwritten. Debt financing is
automatic at month-end and is not a player/AI debt-issuance action. All values are
provisional, not historical calibration.

A bounded 31-day scenario run issues a month-end USA contract and records the
matching treasury/liability and GBR bond asset. Contract liability equals active
outstanding principal and the creditor bond asset in that test.

### Financing semantics

The accounting fiscal result remains income-tax revenue minus **actual** welfare
expense and interest expense. The separate financing requirement is:

`max(0, welfareRequestedThisMonth + interestExpense − incomeTaxRevenue − treasuryCash)`

- `welfareRequestedThisMonth` is a month-to-date budget memo, including welfare the
  treasury could not pay. It is **not** a payable or liability and resets at close.
- Borrowing never posts retroactive welfare; proceeds remain available for future
  obligations.
- Treasury cash includes prior state-enterprise remittances. Those remittances are
  liquidity, not tax revenue; sufficient cash prevents unnecessary borrowing.
- The requirement is capped by creditor cash, outstanding headroom, and the active
  contract cap. Unissued requirement is reported as `unfinancedDeficitSUSD`.
- Borrowing/principal remain financing movements, not revenue/expense. Interest is
  an expense; the M4b four flow kinds are unchanged.

### Contract bounds and history

- All active/arrears contracts are retained, capped at **64**.
- The newest **32** terminated contracts are retained in detail.
- Older zero-balance terminated contracts are compacted into one exact
  `debtHistory` aggregate per issuer: retired/defaulted counts, principal issued,
  principal repaid, principal written off, and interest written off.
- No contract with outstanding principal or accrued interest is removed.
- Explicit issuance beyond the active cap fails; automatic financing reports the
  unissued amount instead of silently omitting it.
- History aggregates are defensively capped at 256 and validated.

### Verification

Commands actually executed:

- `pnpm run lint` — **PASS** (133 TypeScript files, 45 in `packages/sim`).
- `pnpm typecheck` — **PASS** (six workspace packages).
- `pnpm test` — **PASS: 50 suites, 557 tests**.
- `pnpm run ci` — **PASS, exit code 0**: lint, typecheck, 557 tests, standard
  benchmark, web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

New/extended coverage:

- `m5b-debt.test.ts`: 14 tests covering issuance, creditor cash, ceiling,
  no-unnecessary borrowing with treasury liquidity, genuine shortfall, cash and
  bond legs, coupons, maturity, refinancing, arrears/default, fiscal reporting,
  deterministic round-trip, invalid policies/contracts, and rollback.
- `m5b-debt-bounded.test.ts`: shipped USA policy and 31-day issuance, welfare
  shortfall memo without back-pay, liquidity/remittance effect, active contract cap
  validation, terminated-contract compaction, save/load/hash equality, and active
  liability/bond reconciliation.
- Existing M4b/M4c/M5/M5a/M6/M7 suites remain green.

Final CI benchmark (standard `pnpm run bench`, PASS): M5 sample p50 214.1 ms / p95
233.3 ms, projected full campaign 2.11 h (not run); M6 p50 212.0 / p95 224.3 ms;
M7 tick+snapshot p50 207.7 / p95 210.7 ms; early save 440.7 KiB → 83.1 KiB; M2
200-block stress p95 3.80 ms. Node diagnostics, not mobile evidence.

### Compatibility and limitations

- `WORLD_SCHEMA_VERSION` **16**; `SIM_VERSION` **0.16.0**.
- `SAVE_FORMAT_VERSION` **1**; `dataVersion` **`m3-economy-v3`**.
- Schema-15 and older saves are explicitly rejected; no migration.
- The full 36,524-tick campaign was not run. No native release/device verification.
- Debt remains a simple public-finance subsystem: no banking, central bank, bond
  market/auction, external investors, debt-to-GDP target, interest taxation, or
  player/AI debt issuance action.
- The financing formula is liquidity-based; it does not retroactively fund earlier
  unmet welfare. The accounting result and financing requirement can differ.
- Contract caps are provisional; the USA activation amounts and terms are
  provisional authored inputs, not historical data.

### Commits

Implementation commit: `e12b66d8a262fd5b09c2e5b23280cdeed16ae8b1`
(parent `9c0a827d580184125430efebccd852b4ca663eb6`). Documentation commit: the
immediate child containing this section, `DECISIONS.md`, and
`Century_GDD_v2.5.md`. The final HEAD is reported in the handoff.

## Post-M7 remediation batch 5 — simulation validation boundary and measured performance

**Scope.** D-067 addresses the remaining high-priority simulation-performance
finding only: repeated whole-world validation inside phase calls that already run
inside the atomically staged economic day. It changes no economic formula,
coefficient, scenario, cadence, save format, schema, or AI policy. The full campaign
and native builds were not run.

### Bottleneck confirmed

Source inspection and the eight-polity fixture (8 countries, 16 regions, 5 markets,
64 blocks, 113 buildings, 316 assignments) showed **55.55 whole-world validations per
tick** before the change. Every market validated the whole world at market entry, at
production entry and candidate publication, and at overflow entry and candidate
publication; settlement, both fiscal checks, migration, and the debt phase added
more. The shipped market path also falls back to its conservative cash-funded
attempt on most early days, repeating the complete five-market sequence. A Node CPU
profile attributed roughly a quarter of sampled self time to whole-world validation.

### Change

`runEconomicDay` now treats whole-world validation as a day-boundary concern. Public
phase entry points (`runMarketDay`, `runProductionPhase`, `applyOverflowLosses`,
`settleMarketDays`/`settleMarketDay`, `runFiscalPhase`, `runMigrationPhase`,
`runDebtPhase`) accept optional `PhaseValidationOptions`; their default remains full
whole-world validation. The integrated day calls them with `validateWorld: false`
after its own entry validation, and `tick` still validates the input world and the
complete staged world before `Object.assign` publication. A direct `runEconomicDay`
call (without `tick`) validates at entry and once again after the finished day.

- **Removed:** per-market, per-production, per-overflow, per-settlement, per-fiscal,
  per-migration, and per-debt whole-world sweeps inside the staged day (about 53.4
  validations per tick on this fixture).
- **Retained:** tick entry/publication validation; one candidate validation per
  applied AI action; reservation, reference, and quantity checks; inventory
  conservation; posting structure and semantic checks; account, cash, and
  accounting-identity checks; debt cash conservation; phase rollback; and full
  validation at construction, save/load, and close.
- **Relocated:** the redundant phase checks now happen once at the day boundary.

`validationStats.ts` adds a diagnostic-only counter, disabled by default. It is not
authoritative state, is never serialized or hashed, and does not affect any
simulation decision. It exists so tests and the M5 benchmark can prove the reduction.

### Bounded before/after measurement

Controlled workload: fresh eight-polity world, seed `20261023`, 2 warm-up ticks, then
3 runs × 20 measured `tick()` calls; setup and hashing excluded from timing. The
pre-change run used the same probe with instrumentation enabled.

Environment: Node `v24.22.1`, Windows x64 (`10.0.26200`), AMD Ryzen 5 2600 (6 cores /
12 logical processors), 8 GiB RAM.

| Run | Samples | avg | p50 | p95 | p99 | whole-world validations/tick | hash after 22 ticks |
|---|---:|---:|---:|---:|---:|---:|---|
| Before (`53a60f68`) | 60 | 226.7 ms | 229.0 ms | 266.0 ms | 299.1 ms | 55.55 | `914a75412ed40483` |
| After (`ccc74bde`) | 60 | 54.3 ms | 53.5 ms | 64.4 ms | 92.3 ms | 2.15 | `914a75412ed40483` |
| After, repeat | 60 | 53.8 ms | 52.3 ms | 72.1 ms | 91.7 ms | 2.15 | `914a75412ed40483` |

The apparent gain is far larger than the observed run-to-run spread. These are Node
diagnostics, not mobile evidence.

Standard `pnpm run bench` (final CI run; same bounded harness as Batch 4):

| Case | Batch 4 p50 / p95 | Batch 5 p50 / p95 |
|---|---:|---:|
| M5 eight-polity tick | 214.1 / 233.3 ms | 49.2 / 55.3 ms |
| M6 AI sample tick | 212.0 / 224.3 ms | 48.9 / 57.6 ms |
| M7 complete tick + snapshot | 207.7 / 210.7 ms | 46.2 / 49.1 ms |
| M2 200-block stress | p95 3.80 ms | p95 4.00 ms |

The M5 benchmark now prints `world validations: 32 over 16 ticks (2.00/tick;
boundary checks plus one per applied AI action)`. The projected full campaign from
the M5 sample average is `0.50 h`; the 36,524-tick campaign was **not** executed.
One earlier bounded standard-bench run measured M5 p95 `56.0 ms`, M6 p95 `51.3 ms`,
and M7 p95 `54.0 ms`, which is ordinary run-to-run variation.

### Correctness evidence

`batch5-validation.test.ts` adds ten tests:

1. the pre-optimization 22-tick state hash is unchanged (`914a75412ed40483`), on the
   real multi-country economic path rather than an empty world;
2. a tick performs exactly two whole-world validations (entry + publication) despite
   five markets and a funding-fallback attempt;
3. only applied AI actions add a candidate validation (two boundary checks plus one
   per applied action);
4. public phase entry points still reject an invalid world by default, while the
   staged opt-out is explicit;
5. phase-scoped reservation validation still rejects an invalid quantity in staged
   mode without mutating inventory;
6. markets are cleared in ascending id order exactly once and a duplicate settlement
   is rejected;
7. designated cash is conserved every tick and finance/world validation stays clean;
8. save/load continuation through the January close and February migration is
   hash-identical to an uninterrupted run;
9. direct `runEconomicDay` on a month-end validates its staged close without
   advancing the day, while published-state validation still rejects an unadvanced
   close;
10. the debt phase in staged mode matches the default validated path for an explicit
    issuance, month-end interest accrual, coupon payment, cash conservation, and hash.

The full suite also retains its existing pinned hashes, monthly-close, save/load,
determinism, debt, and conservation tests. The full campaign was not run.

### Verification

Commands actually executed:

- `pnpm run lint` — **PASS** (135 TypeScript files, 46 in `packages/sim`).
- `pnpm typecheck` — **PASS** (six workspace packages).
- `pnpm test` — **PASS: 51 suites, 567 tests**.
- `pnpm run bench` — **PASS, exit code 0**; every reported threshold and gate passed.
- `pnpm run ci` — **PASS, exit code 0**: lint, typecheck, 567 tests, standard
  benchmark, and web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

### Compatibility and limitations

- `WORLD_SCHEMA_VERSION` **16**, `SIM_VERSION` **0.16.0**, `SAVE_FORMAT_VERSION`
  **1**, `dataVersion` **`m3-economy-v3`** — all unchanged. No save migration is
  required because this batch changes neither authoritative fields nor their order.
- No GDD mechanic or acceptance criterion changed. The GDD's day-staging and
  final-validation requirement is preserved.
- An invalid intermediate value inside the staged day is now reported at the end of
  the day instead of inside the exact market/phase that wrote it. The day remains
  atomic and invalid state still cannot be published; direct public phase calls
  still fail immediately.
- Finance-index lookup/construction is now the largest residual per-tick profile
  share. It is not changed in this batch.
- The full 36,524-tick campaign was not executed; `0.50 h` is a projection.
- No native build, device, memory, battery, or frame-rate measurement exists. The
  GDD mobile p95 ≤ 8 ms target remains **NOT EVALUATED**; a lower Node p95 does not
  establish it.

### Commits

Implementation commit: `ccc74bde00b894fa36acdfbcfef556c806b53bad`
(parent `53a60f68ab7af3a71f9ad81158e60b521dcff97a`). Documentation commit: the
immediate child containing this section and `DECISIONS.md`. The final HEAD is
reported in the handoff.

## Post-M7 remediation batch 6 — public phase contracts and integrated economic evidence

**Scope.** D-068 addresses `CEN-AUDIT-017` (migration and settlement phase APIs that
could leave invalid state or double-pay wages/upkeep outside the integrated day) and
`CEN-AUDIT-012` (weak assertions and missing integrated multi-country accounting,
debt, and save/resume evidence). It changes no economic formula, coefficient,
calibration constant, scenario, schema, save format, data version, worker protocol,
debt policy, player-country behavior, or speed control.

### Confirmed findings and root causes

- **Migration.** Moving people can reduce a source block's eligible workforce below
  its existing assignment count. Whole-world validation checks assignment references
  and job slots but does not enforce the eligible-workforce cap; the integrated day
  repaired this externally, while direct `runMigrationPhase` and
  `applyMigrationRequest` calls returned `employmentDirty = false` with invalid
  assignments. A failed explicit request also did not restore employment state.
- **Settlement.** `settleMarketDays` paid wages and upkeep for **every** building
  regardless of which market results were supplied. A caller settling two markets one
  at a time therefore paid once per market. The single-market wrapper could be used
  on a multi-market world.
- **Test quality.** `m5-market` contained a vacuous `stockLots.length >= 0`; the M5
  world migration tests ran 31 ticks, ending at day 31 without ever processing the
  February migration; a clone-isolation test asserted only the untouched source; the
  period-close equity test used a nonnegative bound; several debt tests asserted
  bounds or returned values rather than exact accounting effects; and the century
  demography test proved only that the end total was positive.

### Public contracts after the fix

**Migration.** `runMigrationPhase` and `applyMigrationRequest` now own their
post-flow repair. When at least one flow is applied they set `employmentDirty` and
force `refreshEmployment`; on success assignments are valid for the new working-age
population and the dirty marker is false. `MigrationDayResult.employmentRefresh`
exposes the transient refresh summary. On failure, population cells, finance and
postings, employment assignments, and the dirty marker are restored. The integrated
day consumes `migration.employmentRefresh` and performs no second repair. A
non-month-start phase call remains a no-op with `employmentRefresh: null`.

**Settlement.** `settleMarketDays` requires exactly one unsettled result for every
market in the world; duplicate, foreign, stale, or partial batches reject before any
mutation. `settleMarketDay` is restricted to one-market worlds. Success marks every
result settled; failure restores account balances, postings, and the posting counter
without marking results settled. The integrated day already supplied the complete
batch and keeps its behavior.

### Meaningful tests added or corrected

- `batch6-integration.test.ts` (new): bounded eight-polity run across two month-end
  closes, two migration dates, active public debt, and save/load continuation.
- Migration: direct phase and explicit-request tests assert employment validity,
  population conservation, cash conservation, unchanged day index, and
  failure restoration of assignments and the dirty marker. The labor test now relies
  on the postcondition instead of manually refreshing.
- Settlement: complete-batch enforcement, single-market restriction, one wage/upkeep
  settlement per building, duplicate rejection, and failed-settlement rollback.
- The vacuous stock-lot assertion was replaced by an actual cross-region transaction
  check. The 31-tick migration tests now process day 31 and assert the migration
  result, population identity, and cash conservation.
- Clone isolation now asserts the clone changed exactly where mutated and the source
  serialization is unchanged. The period-close test asserts exact equity restoration.
- Debt tests assert exact issuance, coupon, maturity repayment, refinancing, and
  default amounts (including written-off interest) and the accounting identity.
- The century demography test now accumulates every birth and death and asserts
  `end = start + births - deaths`.

### Integrated evidence

The new integration test starts at day 28 on the shipped eight-polity sample (8
countries, 16 regions, 5 markets, 113 buildings), issues an explicit 100,000 SUSD
public-debt contract, and processes days 28–61. It covers the January close (day 30),
February migration (day 31), February close (day 58), and March migration (day 59).
Every tick asserts population conservation, global designated-cash invariance, the
finance accounting identity, exactly one wage/upkeep entry per building, market
ordering, and employment validity. It also checks close ordering, contiguous
summaries, issuer liability/creditor bond and accrued-interest reconciliation, bounded
contract/history counts, and save/load continuation from day 40 to day 62 with an
identical state hash. The money model has no creation or destruction: debt
principal, coupons, taxes, welfare, wages, upkeep, purchases, and migration transfers
are account-to-account movements. Contract-history compaction is not exercised by
this one-to-two-contract run; `m5b-debt-bounded.test.ts` retains that coverage.

### Batch 5 preservation

The Batch 5 pinned 22-tick hash `914a75412ed40483` is unchanged, and the validation
counter still shows two boundary validations per tick plus one per applied AI action.
A fresh 42-tick run crossing the day-30 close and day-31 migration produced
`01a981deb85422a4`, exactly the hash recorded for the same workload under Batch 5, so
moving the employment repair into the migration phase preserves simulation outcomes.
The standard benchmark's M5 tick hash remains `5b01b64ad8829490`; its isolated
migration-phase fingerprint changed from `eb031b91b6096a3b` to `8e348ae368bb5bd5`
because that timed phase now includes its own required employment refresh. This is an
API postcondition change, not a tick-outcome change. The benchmark's migration-phase
timing is therefore not comparable to the Batch 5 migration-mutation-only measurement.

### Verification

Commands actually executed:

- `pnpm build` — **PASS**; regenerated worker bundle committed.
- `pnpm run lint` — **PASS** (136 TypeScript files, 46 in `packages/sim`).
- `pnpm typecheck` — **PASS** (six workspace packages).
- `pnpm test` — **PASS: 52 suites, 572 tests**.
- `pnpm run ci` — **PASS, exit code 0**: lint, typecheck, 572 tests, standard
  benchmark, and web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

The full 36,524-tick campaign, soak/stress runs, profiler campaign, and native builds
were not run. The standard bounded benchmark remains part of CI.

### Compatibility and limitations

- No `WORLD_SCHEMA_VERSION`, `SIM_VERSION`, `SAVE_FORMAT_VERSION`, or `dataVersion`
  change. Save compatibility is unchanged.
- Public API behavior changes are limited to the migration postcondition,
  `MigrationDayResult.employmentRefresh`, and settlement batch coverage. A direct
  migration call now refreshes employment, which is additional work but preserves the
  integrated tick's outcome.
- `settleMarketDay` is intentionally narrower; multi-market callers must use
  `settleMarketDays`.
- No native/device or mobile measurement exists. The GDD mobile target remains **NOT
  EVALUATED**.
- The 42-tick hash equivalence is evidence for the eight-polity fixture at that
  horizon, not a full-campaign recalibration. No calibration data changed.

### Commits

Implementation commit: `a0ca78086a9df47699d5b3e500cafa0dfec46f51`
(parent `e13651c76a0013f8bfb2841e5b4aa2eaf18cc71c`). Documentation commit: the
immediate child containing this section and `DECISIONS.md`. The final HEAD is
reported in the handoff.

## Post-M7 remediation batch 7 — historical-data integrity and generated-artifact drift

**Scope.** D-069 addresses `CEN-AUDIT-015` and `CEN-AUDIT-020` only: inconsistent
historical-loader validation, order-dependent employment identifiers, silently
collapsed metadata, the app import boundary, generated worker/scenario drift, and
data-version consistency. No economic content, calibration, scenario meaning, schema,
save format, debt policy, worker lifecycle, performance threshold, or UI behavior
changed. `CEN-AUDIT-016` (sovereignty) remains unresolved and is not addressed here.

### Confirmed findings and root causes

- The historical loader accepted several values that world construction later
  rejected: out-of-range `startDayIndex`, currency keys/names beyond simulation
  limits, exchange rates outside the shared numeric bounds, oversized welfare
  budgets and debt terms, non-32-bit ids, negative region resource caps, and
  employment records that exceeded building job slots or qualified workforce.
- Employment identifiers were assigned from the authored JSON array index before
  sorting. The shipped employment file is empty, but populating it would make ids and
  the canonical hash depend on record order.
- `meta.sources` ids and calibration targets keyed by `(countryTag, metric)` were not
  duplicate-checked; later `Set`/`find` lookups silently collapsed them.
- The app architecture test allowed any `@century/sim-worker/*` subpath, including
  the privileged `host` and `snapshot` implementations, and skipped generated files.
- The committed worker bundle and worker scenario module had no drift check in CI, so
  a source change could leave the app using stale generated output.

### Historical-loader validation

`validateM5HistoricalData` now rejects at the data boundary, with aggregated
`HistoricalDataError` diagnostics that name the field and record:

- `startDayIndex` must be an integer in `0..35,523` (a processable campaign day).
- Country, region, market, and employment ids must be unsigned 32-bit values.
- Country tags/names, currency keys/names, and currency formats use the same limits
  as `assertValidCountryCurrencyState`.
- `susdPerUnit` must be inside `CURRENCY_RATE_MIN..CURRENCY_RATE_MAX`; specified
  valuations still require known sources.
- Welfare budgets, debt coupons, terms, grace periods, principal ceilings, creditor
  ids, and country-creditor existence use the debt/fiscal safe bounds.
- Currency, region, and country relationships; private building ownership; stock-lot
  good/owner/market references and positive quantities; finite savings products; and
  non-negative resource caps are checked.
- Employment requires a known building and matching region, a known profession that
  is a job of that building definition, a positive safe-integer worker count within
  the definition/level job slots, and enough qualified regional workforce. Aggregate
  assignments per region/profession are compared with
  `floor(workingAge * participationRate)` from the same expanded age profile used for
  world construction.

`assertValidEconomyDefinitions` and `assertValidPopulationDefinitions` remain the
shared static-definition validators. No simulation validator was loosened and no
calibration value was changed to satisfy a new check.

### Stable employment identifiers

Authored employment has no explicit id field, so generated ids are now assigned after
resolving `(buildingInstanceId, popBlockId, professionId)`: records are sorted by that
authoritative tuple and numbered from zero. Record order therefore cannot change ids
or the canonical hash. Duplicate composite identity
(`regionId:professionKey:buildingKey`) is rejected with the duplicate path and the
first declaration index. A two-record fixture is built forward and reversed; both
scenarios expose the same ids and produce the same world hash.

### Duplicate metadata

`meta.sources[].id` duplicates and calibration duplicates keyed by
`(countryTag, metric)` now report both conflicting indices. Existing unique checks for
calibration ids, country tags/ids, currency keys, region/market/building keys,
population keys, employment keys, and stock-lot keys remain. Duplicates that are valid
by design, such as one source referenced by several records, are not rejected.

### App import boundary

The architecture test now applies an explicit allowlist based on the worker package's
public exports:

- **Allowed:** `@century/sim-worker` (root protocol/selectors/autosave/supervisor) and
  `@century/sim-worker/persistence` for the storage codec.
- **Rejected:** `@century/sim-worker/host`, `*/snapshot`, `*/node`, any other worker
  subpath, and `@century/sim` or `@century/data` including subpaths.
- **Generated module:** the committed bundle is treated as opaque payload; it may
  export only `SIM_WORKER_SCRIPT`, `SIM_WORKER_HTML`,
  `SIM_WORKER_BUNDLE_BYTES`, and `SIM_WORKER_HTML_BYTES`.

Positive and negative import fixtures exercise the policy, and the actual app source
is scanned with the same rule.

### Generated-artifact integrity

The existing esbuild toolchain remains the only bundler. `build-worker.mjs --check`
regenerates in memory and compares against the committed file without writing;
`generate-scenario.mjs --check` does the same for the worker scenario module. Mismatch
messages report byte lengths and the first differing byte.

- Explicit regeneration: `pnpm -F @century/app build:worker` and
  `pnpm -F @century/sim-worker scenario:build`.
- Check-only path: `pnpm run check:worker` builds the data package once, then runs
  both `--check` commands. It does not overwrite either artifact.
- CI runs `check:worker` **before** `pnpm bench`, because the bench build regenerates
  the committed artifacts. The check therefore detects stale commits rather than
  validating output produced earlier in the same pipeline.
- A test proves the current bundle passes, two independent generations are
  byte-identical, and a stale copy fails without being overwritten.

### Data-version semantics

`DATA_PACKAGE_VERSION`, simulation `DEFAULT_DATA_VERSION`,
`DATA_PACKAGE_INFO.version`, every scenario JSON `dataVersion` (top-level or `meta`),
and the historical meta value must agree; a focused test enforces this. This batch is
validation-only and changes no authored economic content or scenario meaning, so **no
data, schema, or simulation version bump is required**. Incompatible older saves
continue to be rejected under the existing policy.

### Verification

Commands actually executed:

- `pnpm build` — **PASS**; commits the regenerated worker bundle/scenario only when
  their sources change.
- `pnpm run check:worker` — **PASS** (scenario and app bundle are current).
- `pnpm run lint` — **PASS** (139 TypeScript files, 46 in `packages/sim`).
- `pnpm typecheck` — **PASS** (six workspace packages).
- Focused historical/architecture/version/bundle suites — **PASS**.
- `pnpm test` — **PASS: 55 suites, 585 tests**.
- `pnpm run ci` — **PASS, exit code 0**: check:worker, lint, typecheck, 585 tests,
  standard benchmark, and web/iOS/Android Expo exports.
- `git diff --check` — **PASS**.

Not run: full 36,524-tick campaign, long soak/stress tests, profilers, or native
builds. Check-only verification, explicit bundle regeneration, and Expo exports are
distinct steps in the report: CI runs the check before the bench build; the bench's
`pnpm build` may regenerate artifacts but only after the check has passed.

### Remaining limitations

- `CEN-AUDIT-016` sovereignty is unresolved; no political model was invented.
- The loader validates authored historical data, not arbitrary third-party data
  schemas; `JSON.parse` cannot report duplicate object keys.
- Employment identity is stable under record reordering. Adding/removing records can
  renumber later ids (sequential scheme); the authoritative tuple and duplicate
  rejection remain deterministic.
- Generated-artifact checks cover the committed app bundle and worker scenario module;
  other generated data artifacts are governed by their own scripts and tests.
- No native/device measurement was performed; the mobile performance target remains
  **NOT EVALUATED**.

### Commits

Implementation commit: `7a8358fdcea456088e1def838072f0ccfb7c1581`
(parent `b45d0253acfc344040a7067d6df5cacdf785c8e6`). Documentation commit: the
immediate child containing this section and `DECISIONS.md`. The final HEAD is
reported in the handoff.

## Economic Management Overhaul — E0 design, E1/E2/E3/E4 implementation, and M7a annual accounting

GDD v2.6 added the **Economic Management Overhaul** as a first-class design program
(GDD §17A; D-070). **E0 is documentation/design; E1, E2, E3, and E4 are implemented;
M7a annual accounting is implemented in GDD v2.8/v2.9.** E5–E6 and M8a are planned and
not implemented. Private co-financing, loans, guarantees, investment tax credits,
general goods/services procurement, public-enterprise expansion/discontinuation,
infrastructure, and land/space remain explicit later-stage dependencies.

The overhaul's central goal is that the player governs a country's economy through
consequential policy choices, public spending, investment, and institution-building:
diagnose the economy, choose a strategy, implement and finance it, then observe and
adapt. The specification covers:

- **Seven policy areas:** fiscal/public finance; public investment/construction;
  industrial/business policy; trade/commercial policy; labor/social policy; monetary
  policy/currency; regulation/structural reform. Every instrument names its base,
  calculation/posting path, affected agents, timing, consequences, implementation
  status, and dependencies.
- **Economic interface:** five player questions, a national dashboard with defined
  units/periods, evidence-based causal explanations, pre-commitment explanations, and
  a bounded monthly report/action history. No undefined GDP headline or false causal
  precision.
- **Eleven principles:** one player-controlled country, real mechanics, trade-offs,
  time lags, government constraints, explainable outcomes, institutionally
  appropriate policies, determinism, UI/simulation separation, calibration honesty,
  and no decorative controls.
- **Roadmap:** E0 design, then E1 economic clarity/reports, E2 fiscal management, E3
  public investment/construction, E4 industrial/business policy, E5 labor/social
  institutions, and E6 trade/monetary economy (E6a trade, E6b retained M8a monetary
  foundations).
- **Integration:** combined order `M7 → E0 → E1 → M7a (recommended before E2) → E2 →
  E3 → E4 → M8 → M9 → E5 → E6 → M10`. M0–M7 records, M7a, M8a, and M8–M10 are not
  renumbered; M8a keeps its scope as E6b. The M7 native/device exception remains
  separate.
- **Acceptance:** overall player questions, strategy divergence, per-stage testable
  criteria, and concrete usability tasks.

The complete E0 specification is preserved in [GDD v2.11 §17A](./Century_GDD_v2.11.md);
GDD v2.10 is retained as [historical E3 documentation](./Century_GDD_v2.10.md), GDD
v2.9 as [historical E2 documentation](./Century_GDD_v2.9.md), GDD v2.8
as [historical M7a/E1 documentation](./Century_GDD_v2.8.md), GDD
v2.7 as [historical E1 documentation](./Century_GDD_v2.7.md), and
GDD v2.6 as [historical E0 documentation](./Century_GDD_v2.6.md). The E1 change report
is [GDD_V2.7_CHANGE_REPORT.md](./GDD_V2.7_CHANGE_REPORT.md), the M7a change report is
[GDD_V2.8_CHANGE_REPORT.md](./GDD_V2.8_CHANGE_REPORT.md), the E2 change report is
[GDD_V2.9_CHANGE_REPORT.md](./GDD_V2.9_CHANGE_REPORT.md), the E3 change report is
[GDD_V2.10_CHANGE_REPORT.md](./GDD_V2.10_CHANGE_REPORT.md), and the planning/E1/M7a/E2/E3
decisions are D-070, D-071, D-072, D-073, and D-074 in [DECISIONS.md](./DECISIONS.md).
E1 resolves report retention for its scope (12 monthly summaries plus 48 session
actions); M7a resolves bounded annual retention (100 annual summaries, 64 corrections,
latest 12 exposed in snapshots); E2 resolves the implemented fiscal instruments, budget
decomposition, reserve semantics, business-tax accounting, and financing actions; E3
resolves construction accounting (work-in-progress capitalization), the money+idle-
labor+time scope, materials deferral, completion working capital, cancellation
write-off, actions, bounds, and schema 19. The other E0 questions remain open:
construction materials/procurement, land/property, trade counterparties,
banking/credit, inflation measurement, health/pensions/bargaining, sector
classification, broader action expansion, GDP definitions, and save/schema migration
(GDD §17A.16). CEN-AUDIT-016 sovereignty remains unresolved.

### E1 — delivered economic clarity and monthly reports

E1 turns the six M7 screens into a coherent diagnostic interface without adding an
economic mechanic:

- **Overview is the default tab.** It identifies the player/AI country and shows
  population, working-age, employed, hardship, treasury, and debt with stock labels;
  evidence-based problems; estimated production capacity by good; current essential-goods
  stock/prices/capacity; the latest closed fiscal month; and where to investigate.
- **Explanations are evidence-based.** A small rule set covers unmet subsistence/basic
  needs, household cash/wage-base pressure, fiscal pressure, and essential-goods capacity
  gaps. Each states the observation, supporting snapshot fields, caveats, and the
  screen to inspect. No causal percentages or forecasts are fabricated.
- **Budget previews the existing fiscal action.** It shows the affected country, current
  estimated wage base, current/proposed tax and welfare, daily/monthly static deltas,
  treasury, latest interest, and constraints. The preview is pure and does not mutate
  authoritative state; only `set-fiscal-policy` is sent.
- **Ledger has a monthly report and confirmed action history.** Fiscal flows are closed
  period totals; treasury/debt/household-cash are end-of-close balances where the
  detailed window retains them. Compacted months show flows without invented balances.
  Actions are appended only from authoritative `ACTION_RESULT` replies, bounded to 48,
  and session-only (cleared on load/restart).
- **Population/Markets/Map** add definitions and evidence: working-age-not-employed is
  explicitly not unemployment; market capacity is a flow and stock is a balance; historical
  market/demand series are absent and labelled as such.

E1 used snapshot fields derived from existing population, building, market, finance, and
need definitions. Worker protocol was **3** at E1 because the snapshot contract gained
required presentation fields; world schema remained **16**, simulation **0.16.0**, save
format **1**, and data version **`m3-economy-v3`** at that stage. M7a later advances the
world schema/simulation and protocol as described below.

Tests: `e1-economic-clarity.test.ts` covers snapshot/protocol validation, production/wage/
need fields, monthly flow-versus-balance semantics, compacted-summary no-fabrication,
fiscal preview arithmetic, evidence/caveat explanations, bounded action history, and a
rejected action remaining rejected. `e1-ui-wiring.test.ts` covers the Overview default,
screen wiring, preview/report/action-history surfaces, and forbidden headline claims.
E1 implementation commit: `90160ce2f9b9570034b37f08f44f767502f790cd`.

### M7a — delivered annual accounting

M7a adds authoritative annual accounting without adding a player policy control:

- **Annual summary at 31 December.** After the December monthly close, the engine
  appends a compact annual summary for the civil year. Flows are exact sums of that
  year's monthly closes; balances are year-end treasury cash, debt principal liability,
  and interest payable. No annual account-level trial balance is retained.
- **No double close.** The December monthly close is the year-end closing entry. M7a
  verifies revenue/expense are zero and adds no second closing entry.
- **Partial and terminal years.** A campaign starting after 1 January labels the first
  year partial. The terminal 2000-01-01 boundary never creates an annual 2000 period.
- **Controlled corrections.** `postFinanceCorrection` posts a new audited correction
  with original-posting provenance and a required reason. Closed monthly/annual
  summaries are immutable; prior-period corrections land in the current open period.
- **Bounded state.** At most 100 annual summaries, 64 corrections, and latest 12 annual
  reports in the snapshot. Monthly compaction is unchanged.
- **Ledger integration.** The Annual accounting section shows annual flows, year-end
  balances, complete/partial labels, correction count, and recent years.

Schema is **17**, simulation **0.17.0**, save format **1**, data version
**`m3-economy-v3`**, and worker protocol **4** (annual reports added to snapshots).
Schema-16 saves are rejected; no migration is authorized. Tests:
`m7a-annual-accounting.test.ts`. No benchmark, performance measurement, new campaign
workload, or Expo export was run for M7a; the repository-wide test suite retains its
pre-existing century correctness regressions. Implementation commit:
`c8b2e4cd72aa049243c07dfdb413e00c708d07cf`.

### E2 — delivered fiscal management

E2 completes the public-budget loop on the existing M4c/M5b foundation:

- **Income-tax schedule.** `incomeTaxAllowanceSUSDPerYear` is a per-pop-block annual
  exemption pro-rated to the civil year and subtracted from the block's actual daily
  wage receipt; `incomeTaxRate` applies to the remainder. Withholding, posting, and
  cash limits are unchanged.
- **Welfare eligibility and reserve.** `welfareMaxWealthLevel` restricts the daily
  transfer to blocks at or below a wealth ceiling (99 is universal), allocated in
  proportion to eligible population. `reserveTargetSUSD` is a treasury floor: welfare
  may not draw cash below it, and discretionary principal repayment may not either.
  Unpaid welfare remains an explicit shortfall, never a liability.
- **Business-profit tax.** At each civil month-end the country assesses
  `businessProfitTaxRate × max(0, building sales − inputs − wages − upkeep)` per
  building, collects from the building's actual operating cash through the distinct
  `business-profit-tax` posting kind into country `business-tax-revenue`, and reports
  any uncollected amount. The after-tax result feeds M5a retained profit/distribution.
- **Budget decomposition.** Monthly and annual summaries retain requested/paid/
  shortfall welfare, assessed/collected/uncollected business tax, borrowing, principal
  repaid, cash interest paid, and the unfinanced month-end requirement separately from
  the accounting fiscal result.
- **Validated financing actions.** `issue-debt`, `repay-debt`, and `set-debt-policy`
  join the complete `set-fiscal-policy` action through the shared validator. Borrowing
  proceeds are financing, not revenue; early repayment respects treasury cash and the
  reserve floor; refinancing and the outstanding-principal ceiling are player policy
  within existing contracts.
- **Interface.** The Budget screen exposes the schedule, spending/eligibility/reserve,
  and financing controls with static pre-commitment estimates and explicit limits; the
  Ledger shows the confirmed monthly and annual decomposition and action history.
- **Protection.** The AI never targets the player country, and player actions may only
  target the designated player country; invalid or unaffordable actions are rejected
  atomically.

Schema is **18**, simulation **0.18.0**, save format **1**, data version
**`m3-economy-v3`**, and worker protocol **5** (extended action union and required
snapshot fields). Schema-17 and older saves are rejected; no migration is authorized.
Tests: `e2-fiscal-management.test.ts` plus updated fiscal/debt/AI/report/worker tests.
No benchmark, performance measurement, campaign, profiling, or device test was run for
E2 under the developer's no-benchmark restriction. Implementation commit:
`f9aa4e0e2ea9d59dd1999d72704eb9d5261d75d2`.

### E3 — delivered public investment and construction

E3 turns public investment into a real project mechanic:

- **Validated project queue.** A project type is a productive building definition with
  a positive construction cost and authored `constructionWorkers` crew cap, state
  ownership permitted, no required technology, and no resource requirements. The
  player selects a country-owned region and authorizes the project through the shared
  validated action path; the treasury must cover the cost plus the 30-day working-
  capital target, but money is not escrowed.
- **Real idle labor, money, and time.** Each processed day a project hires only
  eligible workers not assigned to production, up to its crew cap and the treasury
  cash available. Construction workers are never added to `world.employment`, so they
  cannot be double-counted. Gross wages are paid to household blocks and capitalized.
  Progress is cumulative gross payroll / authorized cost, not a timer or per-tick
  bonus; the final payment is clamped exactly. A project with no affordable worker
  waits with a `funds` or `labor` reason and resumes when the constraint clears.
- **Capitalization and completion.** Daily wages debit country
  `construction-in-progress` and credit treasury; households receive cash/wage income.
  Completion reclassifies the spent amount to country `public-capital`, creates a
  level-1/condition-1 operational state-owned building with a full account set, adds it
  to the region, and transfers a cash-limited 30-day-upkeep working-capital endowment.
  The building first produces through the ordinary employment/production/market systems
  on the next processed day; there is no instant output bonus.
- **Pause, cancel, and failure.** Pause/resume preserves progress. Cancellation writes
  spent work-in-progress off to country owner equity with no refund, receivable, or
  liability. Funds/labor stalls and cancellation are atomic and validated; completed
  and cancelled projects are terminal.
- **Bounded state.** At most 32 non-terminal projects, 32 retained terminated records,
  and 256 compacted per-country history aggregates; monotonic project/building ids.
  Project queue/history are versioned, serialized, validated, and replay-preserved.
- **Interface.** A Construction tab shows treasury/WIP/public capital, idle labor and
  mean wage, project-type cost/crew/output/working capital, upfront requirement, a
  static duration estimate with assumptions, queue progress, blockers, pause/resume/
  cancel, and retained history. Ledger shows construction outlay/write-off separately
  from welfare/interest expense. The app reads immutable snapshots only.
- **Deliberate scope.** Materials/procurement, private co-financing, subsidies/loans/
  guarantees, public-enterprise operation/expansion, transport-dependent infrastructure,
  land/space, destruction/closure, and owner insolvency are **not** E3 mechanics; they
  are explicit E4/E5/E6a dependencies. The UI states this limitation rather than
  implying material consumption exists. Construction is player-only; AI construction is
  future work.

Schema is **19**, simulation **0.19.0**, save format **1**, data version
**`m3-economy-v4`**, and worker protocol **6** (project types/queue/labor/WIP/public
capital fields, construction budget fields, and three action DTOs). The data-version
bump is required because every authored building definition now carries
`constructionWorkers` and permits state ownership; historical/generated artifacts were
regenerated. Schema-18 and older saves are rejected; no migration is authorized.
Tests: `e3-construction.test.ts` (selection/authorization, idle-labor progress,
completion/production, stalls/resumption, cancellation/rollback, pause/resume,
reporting, save/replay, terminal boundary, bounded history, snapshot/preview), plus
updated worker/UI/report/serialization/hash tests. No benchmark, performance
measurement, campaign, profiling, or device test was run for E3 under the developer's
no-benchmark restriction; no benchmark code, thresholds, or reports were changed.
Implementation commits: `e3b6fff5025af747f0fc78cc6941e1f93631e5ea` (core construction) and `a8c6a9edd2b400dcfd676478222c612efd7c2f1e` (state-ownership UI gate).

### E4 — delivered industrial policy, materials, and public-enterprise support

E4 extends the existing economy rather than creating a parallel one:

- **Validated sector classification.** Every building definition carries a
  `sector` (`agriculture`, `food-processing`, `textiles`, `manufacturing`, `storage`).
  Subsidy eligibility is derived from this authored data.
- **Construction material requirements and procurement.** Definitions carry a
  construction/commissioning material bill using existing goods. Before hiring labor, a
  project buys missing quantities from its regional market's actual stock at the current
  price, consuming canonical stock lots and paying sellers through `sales-revenue`.
  Purchases are capitalized into work-in-progress; delivered quantities are capped so a
  retry/replay cannot duplicate a delivery. A project waits with `materials` when stock
  is absent or `funds` when cash is insufficient, and resumes automatically. Completion
  and cancellation include both labor and material cost.
- **Sectoral production subsidy.** A validated per-country sector rate is applied to
  verified daily physical output valued at the post-clearing market price. Payment is
  limited by actual treasury cash, posts country `subsidy-expense` and enterprise
  `subsidy-revenue`, and is included in the month-end business-tax base. Unpaid
  entitlement is an explicit shortfall, never debt or a receivable.
- **Public-enterprise capital support.** A player action contributes treasury capital to
  an existing state enterprise's operating cash/equity. It is capital, not expense, a
  loan, or a guarantee; it does not guarantee inputs, sales, profit, level, or continued
  operation. Ordinary production, wages, upkeep, tax, and M5a remittance rules still
  apply.
- **Interface.** An Industry tab shows sector rates, current capacity-value estimates,
  static daily subsidy exposure, month-to-date requested/paid/shortfall, and existing
  state enterprises with capital-support controls. Construction shows material
  requirements, delivered/remaining quantities, prices, stock/shortfalls, material
  progress, and material stalls. Ledger reports subsidy, material, and capital-support
  flows separately.
- **Explicitly not implemented.** Private co-financing, government-supported private
  projects, loans, guarantees, investment tax credits/deductions, general goods/services
  procurement or open orders, public-enterprise expansion/discontinuation, industrial
  program bundles, and price/production controls. They are labelled in the GDD/UI rather
  than simulated decoratively. Procurement/delivery is immediate against actual stock;
  no order is counted as delivered goods.

Schema is **20**, simulation **0.20.0**, save format **1**, data version
**`m3-economy-v5`**, and worker protocol **7**. Data v5 adds sectors/material bills to
all building definitions; historical/generated artifacts were regenerated. New
cash-neutral postings are `construction-material-purchase`, `production-subsidy`, and
`public-enterprise-capital-contribution`; new accounts are building `subsidy-revenue`
and country `subsidy-expense`. Schema-19 and older saves are rejected; no migration is
authorized. Tests: `e4-industrial-policy.test.ts` plus strengthened E3, worker, UI,
reporting, serialization, and hash tests. No benchmark, performance measurement,
campaign, profiling, or device test was run for E4 under the no-benchmark restriction;
no benchmark code, thresholds, or reports were changed. Implementation commit:
`a859f2a89c8229fa12c9c57b7862307140fb721d`.

## Development workflow


1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin the next milestone until the current one is reviewed and the next
   phase is explicitly authorized in the GDD and task assignment.
