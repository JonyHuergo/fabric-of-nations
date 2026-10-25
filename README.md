# Century — M0/M1/M2.1/M3a–M3f/M4a-1 foundation

Century is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, with one simulated civil day
per tick.

The repository currently implements **M0 (project foundation)**, **M1
(simulation core)**, **M2.1 (corrected population core)**, **M3a (economy
definitions, state, validation, and serialization)**, **M3b (deterministic
employment assignment)**, **M3c (production, input reservations, and inventory
movement)**, **M3d (deterministic two-pass market clearing with bounded
prices)**, **M3e (cash settlement, wages, upkeep, retained producer profit, and
household cash)**, **M3f (integrated daily economic tick)**, and **M4a-1
(category-aware double-entry accounts, opening balances, and
recognition legs)** only. Government finance, taxes, period closing,
distributions, debt/credit, inflation/FX, countries, currencies, politics,
technology, diplomacy, warfare, AI, worker, and React Native UI behavior are not
implemented.
The design authority is the [Century GDD v2.2](./Century_GDD_v2.2.md); persistent
engineering rules are in [`AGENTS.md`](./AGENTS.md), and implementation decisions
are in [`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world, population, demography, needs, wealth, M3a economy state/ledger, M3b employment, M3c production/inventory, M3d market clearing, M3e settlement, M3f integrated economic tick, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON static definitions (population, goods, professions, buildings, M3 scenario), calibration/source references, and validated loader | `@century/sim` |
| [`packages/app`](./packages/app) | Placeholder for the future Expo/React Native shell (M7) | none |
| [`packages/bench`](./packages/bench) | Headless M1/M2.1 benchmark harness | `@century/sim`, `@century/data` |
| [`packages/tests`](./packages/tests) | Jest unit, integration, conservation, determinism, serialization, and calibration tests | `@century/sim`, `@century/data` |

`packages/sim` compiles with `"lib": ["ES2022"]` and `"types": []`, has no
runtime dependencies, and imports only its own relative `.js` modules. It must
never import the app, data loader, benchmark, or platform code. Static
definitions live as JSON under `packages/data/data` and are passed explicitly
through `TickContext`; they are not serialized into `World`.

## Requirements and commands

- Node.js **22.12.0 or newer**
- pnpm **9.15.9**

| Command | Effect |
|---|---|
| `pnpm install` | Install the workspace reproducibly from `pnpm-lock.yaml`. |
| `pnpm run build` | Compile every package in dependency order. |
| `pnpm run lint` | Boundary checks: no ambient RNG, no forbidden APIs in `sim`, ES2022-only config, no runtime deps in `sim`. |
| `pnpm run typecheck` | Typecheck every package in strict mode. |
| `pnpm test` | Run the Jest suite. |
| `pnpm run bench` | Build M1/M2.1 benchmark cases and report timings and hashes. |
| `pnpm run ci` | Local CI path: lint, typecheck, test, benchmark. |

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

- Schema version: `6`; simulation version: `0.6.0`; data version:
  `m3-economy-v1` (M4a-1 changes the runtime account contract, not the static
  definitions).
- Schema-5 / simulation-0.5 saves are rejected with an actionable error; no
  migration is attempted.
- `maleByAge` and `femaleByAge` are tagged `Uint32Array` values. The payload also
  includes `startDayIndex`, fractional birth/male-split/death remainders, finance
  accounts with `category`/`subtype`, `nextAccountId`, and the opening-balance
  record.
- Canonical JSON makes checksum and decode independent of object key insertion
  order. The state digest covers single-year sex state, accounts, diagnostics,
  `startDayIndex`, and the opening record.
- Empty-world M1 regression digest (seed `123456789`, scenario
  `m1-determinism`): `8c2315493f71ab6b`.
- Full-century aggregate digest: `8e8e021bd3c8bcb5`.
- WPP validation digest: `78a43b9772738cad`.
- M3 structural-world digest (seed `20261023`): `0794a85763a141f1`.

## Benchmark scope and recorded Node results

`pnpm run bench` reports M1 no-op, M2.1 world-aggregate century, M2.1 stress
cases at 200, 1,000, 3,000, and 6,000 population blocks, an M3b
employment-refresh workload, M3c production/inventory workloads, M3d market-day
workloads, M3e settlement workloads, and M3f integrated economic-day workloads.
Stress scales repeat the three deterministic multi-block templates (400k/350k/250k
people), so total population grows with block count. Each M2 stress scale uses 100
warm-up ticks and 730 measured ticks.

**M4a-1 re-measurement note.** The M3b–M3f tables below are the recorded
pre-M4a-1 (schema-5) baselines and are retained as history. M4a-1 changes
authoritative account state and posting line shape, so world hashes differ and
Node timings shifted. The current M4a-1 Node run on the same machine produced:

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
set. The 200-block p95 threshold still passes. These are Node diagnostics only;
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

The 200-block p95 threshold remains 5 ms and passes. Larger scales are
diagnostic, not acceptance thresholds. The GDD mobile p95 ≤ 8 ms target is
**NOT EVALUATED**; this is a Node harness, not a mobile release build.

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

## Known limitations

- M4a-1 adds category-aware double-entry accounts, recognition legs, and opening
  balances only. Period closing, distributions, remittances, taxes, debt,
  countries, currencies, inflation, and FX are not implemented.
- Inventory is not an accounting asset: input purchases are expensed when
  purchased and there is no COGS or inventory valuation. This is a provisional
  cash-basis simplification, not full accrual accounting.
- Revenue and expense account balances accumulate until a later milestone
  introduces period closing; M4a-1 has no closing entries.
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
  no taxes, interest, dividends, debt/credit, government finance, politics,
  technology, diplomacy, warfare, AI, migration, social mobility, or UI exists.
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
- M3f monthly wealth uses the current day's actual settled wages annualized by the
  civil year because no monthly income accumulator exists. **A trailing-month
  income average is not implemented**; the GDD does not define that measurement
  window. This limitation is recorded in `DECISIONS.md`.
- M3f first attempts full desired production demand, then falls back to
  opening-cash-capped production demand if settlement would be unfunded. The
  fallback is safe but can underuse valid same-batch sales receipts; it is
  reported as `fallbackUsed`.
- M3f stages each economic day with a structural deep clone for whole-day
  atomicity. The clone is schema-specific and must be extended when authoritative
  state gains fields; this is a correctness mechanism, not evidence of mobile
  performance.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin M4 until M3f is reviewed and the next phase is explicitly
   authorized.
