# Century — M0/M1/M2.1/M3a–M3f/M4a-1/M4a-2/M4b/M4c/M5/M5a/M5b/M6 foundation

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
arrears, and default)**, and **M6 (deterministic country AI v1, persisted AI
schedule/goal state, shared player/AI fiscal-policy action validation, AI stress
fixture, and opt-in full-campaign performance report)** only. Corporate/consumption/land/tariff taxes, broader
government expenditure and services, banking/central banking, dynamic FX,
inflation, monetary policy, annual close, reopen/reversal, politics, technology,
diplomacy, warfare, worker, and React Native UI behavior are not
implemented. The designer has adopted planned intermediate stages for annual close
and controlled corrections (M7a) and inflation/FX/monetary-policy foundations
(M8a); these are planned only, not implemented (see
[the roadmap](#planned-development-roadmap-and-intermediate-finance-stages)).
The design authority is the [Century GDD
v2.5](./Century_GDD_v2.5.md); v2.4 is retained as
[historical documentation](./Century_GDD_v2.4.md), and v2.3 as
[earlier historical documentation](./Century_GDD_v2.3.md). Persistent engineering
rules are in [`AGENTS.md`](./AGENTS.md), and implementation decisions are in
[`DECISIONS.md`](./DECISIONS.md).

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world, population, demography, needs, wealth, M3a economy state/ledger, M3b employment, M3c production/inventory, M3d market clearing, M3e settlement, M3f integrated economic tick, M4a account/country model, M4b monthly period close, M4c government fiscal loop, M5 multi-market/migration/labor access, M5a profit allocation, M5b public debt/deficit financing, M6 country AI/action validation, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON static definitions (population, goods, professions, buildings, M3 scenario), calibration/source references, M5 historical pipeline and eight-polity sample (with M5a profit and M6 AI policies enabled), and validated loader | `@century/sim` |
| [`packages/app`](./packages/app) | Placeholder for the future Expo/React Native shell (M7) | none |
| [`packages/bench`](./packages/bench) | Headless M1–M6 benchmark harness, including the opt-in full-campaign mode | `@century/sim`, `@century/data` |
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
| `pnpm run bench` | Build all benchmark cases (M1 through M6) and report timings, hashes, and invariant gates. |
| `pnpm run bench:campaign` | Opt-in M6 full 36,524-tick campaign benchmark with per-tick p50/p95/p99, AI counts, bounded-state checkpoints, and final save size. Long-running; not part of `pnpm run ci`. |
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

GDD v2.5 is the current design authority and records the M4c government fiscal
loop (D-048) alongside the M4b close (D-047), the M4a-2 model (D-044/D-045), M5
(D-051–D-055), M5a (D-056), and M5b (D-057). M7a and M8a remain planned only;
see the roadmap below.
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
  or a rest-of-world trade account; GDD v2.5 does not specify those mechanics, so
  they are recorded as explicit non-goals (D-051), not placeholder behavior.
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
  fixtures default it off. Rates, terms, and ceilings are provisional and are not
  calibrated or player/AI controls.
- **Contracts.** Contracts persist in `FinanceState.debtContracts` with contract
  version, issuer, holder, original and outstanding principal, coupon, issue day,
  maturity, accrued interest, status (`active`, `arrears`, `repaid`, `defaulted`),
  and arrears start day. `nextContractId` is a deterministic allocator.
- **Accounting.** Issuance debits issuer treasury cash and credits debt liability,
  and debits holder bond asset and credits holder cash. Interest accrues daily as
  issuer interest expense/interest payable and holder interest receivable/income.
  Coupon payment reduces interest payable/cash and holder cash/receivable. Principal
  repayment reduces debt liability/cash and holder cash/bond asset. Default writes
  the remaining liability and interest off against owner equity on both sides.
  Borrowing is not revenue, principal repayment is not expense, and none of these
  kinds enters the M4b four-flow summary.
- **Timing and deficit financing.** After the daily fiscal phase, the debt phase
  accrues one day of interest (actual-day/365 or /366). At each month-end it pays
  finances the accrued fiscal deficit, pays accrued coupons
  (`welfare-expense + interest-expense - income-tax-revenue`) by issuing new debt,
  processes maturities, and applies the arrears/default rule. Debt issuance is
  staged and atomic with the day; the M4b close then records the period result.
- **Constraints.** New issuance is limited by the designated creditor's actual cash,
  the issuer's outstanding-principal ceiling, and the accrued deficit. A deficit
  that cannot be financed is reported as `unfinancedDeficitSUSD`; no invisible
  liability is created. M4c's welfare shortfall rule is unchanged.
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
- **Versions.** Schema **12**, simulation **0.12.0**, save format 1, data version
  `m3-economy-v1`. Schema-11/simulation-0.11.0 saves are rejected; no migration.
- **Limitations.** No commercial banking, deposits, central bank, monetary issuance,
  bond-market pricing, derivatives, external investors, debt-to-GDP target, debt
  auctions, or player/AI debt actions. Automatic financing covers the accrued
  month-end deficit, not an intra-month welfare liquidity shortage. Interest is not
  taxed. The full campaign is benchmarked from a sample, not executed end to end.
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

## Planned development roadmap and intermediate finance stages

M0–M6 are implemented (see the sections above). The designer has adopted
intermediate finance stages (recorded as D-050) for work that earlier revisions
left unassigned. **M5a, M5b, and M6 are implemented and accepted; M7a and M8a
remain planned and not implemented**: no runtime behavior, schema field, save
version, benchmark gate, or UI support exists for them yet. They preserve the
existing M0–M10 milestone identities and do not change M4a/M4b/M4c/M5/M5a/M5b/M6.

Intended implementation order:

`M4c → M5 → M5a → M5b → M6 → M7 → M7a → M8 → M8a → M9 → M10`

| Stage | Placement | Planned scope | Status |
|---|---|---|---|
| **M5a** | After M5, before M5b and M6 | Profit distributions to designated private owners/household capitalists or deterministic retention as business funds; actual state-owned-enterprise profit remittances to country treasuries through balanced postings; ownership, timing, account semantics, and available-funds constraints | Accepted |
| **M5b** | After M5a, before M6 | Versioned public-debt contracts, issuance with matching asset/liability entries and cash transfers, interest, maturity/principal repayment, refinancing, arrears, and explicit default; separation of deficit, financing, borrowing proceeds, interest expense, and principal repayment | Accepted |
| **M7a** | After M7, before M8 | Annual finance summaries and periods, year-end closing consistent with the M4b monthly close, partial campaign years, and controlled auditable correction/reversal entries that preserve closed history | Planned |
| **M8a** | After M8, before M9 | Documented inflation/price-level measure, exchange-rate dynamics on the existing country/currency identities, monetary-policy authority/controls with explicit causal mechanisms and balanced money/credit accounting | Planned |

Key boundaries:

- **The playable vertical slice remains M0–M7.** M7a and M8a are post-slice stages
  and are not prerequisites for the initial playable release. M5–M7 are not
  blocked on the later monetary systems.
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
  system or monetary aggregate) must be recorded rather than hidden.
- The full planned scope, acceptance boundaries, and dependency rationale are in
  GDD v2.5 §17.3–§17.4. This section is a repository summary, not a claim of
  current support.

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
M6 AI-enabled representative/stress workloads. The opt-in
`pnpm run bench:campaign` executes the complete M6 campaign. Stress scales repeat
the three deterministic multi-block templates (400k/350k/250k people), so total
population grows with block count. Each M2 stress scale uses 100 warm-up ticks and
730 measured ticks.

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
| GDD 4 MiB save target | **NOT MET** (18.76 MiB); M4b retains one pre-close trial balance per month |

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
- M6's full-campaign measurement shows the pre-close trial balances retained for
  every closed month dominate save size: the measured full-campaign save is
  **18.76 MiB**, above the GDD's 4 MiB engineering target. The monthly history is
  bounded (`MAX_PERIOD_SUMMARIES = 1200`) and is not per-day growth, but compression
  or history compaction is not implemented. This target is reported as **NOT MET**,
  not hidden.
- The M6 full-campaign benchmark is a Node diagnostic and does not measure mobile
  frame rate, device memory, battery, or release-build tick time.

## M6 completion report

### 1. Exact M6 scope and GDD acceptance criteria

The authoritative GDD v2.5 §17 assigns M6: **deterministic country AI v1, action
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
sample is still provisional and not a world total. The full-campaign save is
**18.76 MiB**, which exceeds the GDD 4 MiB engineering target because M4b retains
one pre-close trial balance per month; compression/history compaction is not
implemented. The monthly history is bounded at 1,200 summaries and is not per-day
growth. Node benchmark timings are diagnostics; mobile performance and the mobile
p95 ≤ 8 ms target remain **NOT EVALUATED**.

### 8. Final repository state

Branch `main`. The implementation HEAD is
`f321c01432a55858a07e0ccc9e2c6acac4ffbc09`; its parent is the accepted M5b HEAD
`cc7d9aa759f00618bbd77f993a617b1e2059eef0`. The documentation commit is the
immediate child and is the final HEAD reported in the handoff. The working tree is
clean after both commits, and no later milestone is started.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md`.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
7. Do not begin the next milestone until the current one is reviewed and the next
   phase is explicitly authorized in the GDD and task assignment.
