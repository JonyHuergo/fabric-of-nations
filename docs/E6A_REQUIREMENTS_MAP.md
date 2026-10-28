# E6a — Transport, Access, and Inter-market Trade: requirements map

Status: implementation planning record for E6a. It maps the authoritative GDD v2.15
§17A.8, §17A.8.1–§17A.8.3, §17A.13.2 E6a, §17A.14 E6a, §17.5, and the §17A.16 open
questions ("Infrastructure transport/access model", "Trade counterparty/rest-of-world")
to code paths, authoritative state, simulation phases, player actions, accounting, and
tests. Decisions are recorded in D-079. The GDD is authoritative; deferrals are listed
in §7 and are permitted by the E6a definition of done.

## 0. Focused E5 closure review (non-benchmark)

Repository state at the start of E6a: `main` at
`fd8a92cd538f3f45cfe969f980856e1ea5f4e9b4`, clean working tree. That matches the
reported E5 final HEAD. `pnpm -F @century/tests test -- e5-labor` (11 tests),
`-- m5-migration m5-world e5-worker` (23 tests) pass before any E6a edit.

Findings against the current GDD and the E6a integration points:

- **M8 trade law and migration.** `politics.ts` applies a trade-slot law's
  `borderPolicy` to `Country.immigrationOpen`; `employment.ts` and `migration.ts`
  read that flag for cross-country access. E6a keeps that as the *migration* path and
  does not reuse it for goods. The two are distinct systems (people vs goods).
- **Population conservation during migration.** The M5 migration phase moves
  single-year age counts between blocks and preserves totals; the E5 suite and the
  M5 migration suite pass. E6a touches no population state.
- **M9 qualifications and age-specific literacy.** `PopBlock.qualification` and
  `literacyByAge` are separate authoritative values used by wages/capacity; nothing
  in E6a reads or rewrites them.
- **Regional infrastructure.** M8 introduced `Region.infrastructure` (0..1) and it is
  used only by the institution-quality derivation today. E6a reuses it as the sole
  transport-capacity input rather than adding a second infrastructure value.
- **Market clearing and settlement.** `runMarketDay` clears one market against its
  own lots/prices; `settleMarketDays` settles every market once with once-per-day
  wages/upkeep. E6a keeps both untouched and runs dispatch *after* settlement.
- **Conclusion.** No mandatory E5 acceptance failure exists and no E5 remediation is
  required. E6a adds new state and phases only.

One narrow extension is required: runtime validation of stock-lot ownership must
permit imported lots (owned by a foreign building) in worlds where trade is enabled.
This is documented in D-079 §8, is scoped to trade-enabled worlds, and leaves
scenario-authored (initial) stock strict.

## 1. Authoritative E6a criteria

| # | GDD source | Criterion | Existing subsystem / code path | E6a model and authoritative state | Player/worker action | Tests |
|---|---|---|---|---|---|---|
| A1 | §17A.8.1.1 | Inter-market goods flows with explicit origin/destination, quantity, price, delivery timing, and inventory movement | `market.ts`, `production.ts`, inventory lots | `TradeShipment` records good, quantity, seller building, origin/destination market and country, dispatch/arrival day, cargo value, freight, duty. Goods leave origin stock at dispatch and enter destination stock exactly once at arrival | none (automatic by producers) | dispatch/arrival, in-transit exclusion, exact-once delivery |
| A2 | §17A.8.1.2 | Transport/communications cost and capacity, including route/access constraints and their effect on landed prices and delivery | `Region.infrastructure` (M8), new trade routes | Validated `TradeRoute` market pairs with distance/capacity; capacity = base × infrastructure factor; freight = quantity × good transport cost × distance; transit days from distance. No route ⇒ no trade | none (observed in snapshot) | capacity limit, infrastructure effect, freight accounting, route validation |
| A3 | §17A.8.1.3 | Customs boundary with a dutiable event, origin/destination country, commodity classification | new `Market.customsCountryId`, `Country.trade` | Dutiable event = shipment between markets with different customs administrations; origin/destination country recorded; classification = good id; ad-valorem rate by good | tariff schedule | tariff levied once, correct base/rate, same-zone exemption |
| A4 | §17A.8.1.4 | Balanced trade postings (buyer, seller, transport, customs/treasury, counterparty) with no money or goods creation | `accounting.ts`, `settlement.ts` patterns | `trade-freight` (building expense/cash → system reserve/income) and `customs-duty` (building expense/cash → destination treasury/customs revenue) are cash-neutral; goods are conserved, not created | none | posting balance, cash conservation, inventory conservation |
| A5 | §17A.8.1.5 | Currency/valuation transactions only if prices/currencies differ | `currency.ts`, SUSD convention | All market prices and accounts are already SUSD; no FX conversion is added. Explicitly E6b | none | documentation; no FX effect |
| A6 | §17A.8.1.6 | Trade policy state and validation with time/scope rules and a player/AI action path | `ai.ts` action path, `protocol.ts` | `Country.trade`: tariff rates by good, monthly import quota by good with month-to-date usage, export restriction by good. One validated `set-trade-policy` action | `set-trade-policy` | validation bounds, quota reset/limit, restriction effect |
| A7 | §17A.8.1.7 | A rest-of-world or foreign counterparty | `Country`, `BuildingInstance`, `Market` | The foreign counterparty is the real foreign selling building, its operating account, and its country; bilateral origin/destination country is recorded per shipment. No non-simulated RoW sector (would create unbacked goods/cash); external accounts/FX = E6b | none | cross-country shipment parties and postings |
| A8 | §17A.13.2 E6a | A tariff changes actual landed cost/quantity/revenue; shared-market clearing is not relabelled as trade | trade phase, settlement, fiscal totals | Duty raises the landed cost, reduces the shipped quantity, and posts actual revenue to the destination treasury and `customsDutyRevenueSUSD`; intra-market pooled clearing remains untouched | `set-trade-policy` | landed-cost/quantity/revenue test, no duty on intra-market clearing |
| A9 | §17A.8.3 | Failure modes are observable: stock, capacity, quota, funds, restriction | trade phase result, snapshot | Bounded per-day blocked reasons plus route capacity/policy/shipment snapshot data; UI shows observed state vs estimates | — | blocked-reason tests, snapshot contract |
| A10 | §17A.15 | Deterministic, bounded, versioned, validated, persisted, atomic | `serialization.ts`, `validation.ts`, `day.ts` | Plain state, ascending-id deterministic ordering, no RNG, bounded shipments/diagnostics, schema/protocol/data version bump, staged-day atomicity, idempotent repeat-dispatch no-op, and restore-on-failure | — | determinism/replay, save round-trip, incompatibility rejection, malformed action |

## 2. Implemented instruments

| Instrument | E6a status | Real mechanism |
|---|---|---|
| Inter-market goods trade | implemented | Producer consignment over authored routes with real stock, cash, freight, transit, and destination delivery |
| Transport capacity/access | implemented | Route capacity from authored base × market infrastructure; freight cost; transit delay |
| Customs duty (tariff) | implemented | Ad-valorem import duty at the market customs boundary; shipper cash → destination treasury |
| Import quota | implemented | Monthly physical quota per good per customs administration, month-to-date usage |
| Export restriction | implemented | Per-good prohibition on exports by the country owning the goods |
| Trade agreements / market access | deferred | Requires partner identity and a diplomacy/foreign-relations interface (M8/M10); not faked as a global modifier |
| Export incentives | deferred | Requires the E4 investment/incentive machinery; no free transfer |
| Foreign exchange / external accounts | deferred to E6b | Prices/accounts are SUSD; FX settlement is E6b scope |
| Infrastructure construction | deferred | E6a supplies the transport model; building infrastructure is not required by §17A.13.2/§17A.14 E6a and remains an adjacent extension |

## 3. Authoritative state summary

- `World.trade`: `enabled`, validated `routes` (market pair, distance, base capacity),
  bounded in-transit `shipments`, `nextShipmentId`, month-to-date `memo`, and a
  bounded last-day `report` (dispatches, arrivals, freight, duty, blocked reasons).
- `Market.customsCountryId`: the customs administration of the market (null only in
  countryless legacy worlds).
- `Country.trade`: tariff rates by good, monthly import quota by good, month-to-date
  quota usage, export restrictions by good, and a last-update day.
- `CountryInitialDef.trade` and `EconomyScenarioDef.tradeRoutes` (scenario inputs);
  `GoodDef.transportCostPerUnit` is populated for the sample catalog.
- Finance: `trade-freight` and `customs-duty` posting kinds; `freight-expense`,
  `customs-duty-expense`, `customs-duty-revenue` subtypes; optional fiscal total
  `customsDutyRevenueSUSD`.

Derived values — market infrastructure, route capacity, freight per unit, transit
days, landed cost, quota remaining — are recomputed; they are not a second authority.

## 4. Ordering and timing

1. Politics, labor month start, AI, demography, employment, migration (unchanged).
2. **Trade arrivals**: shipments whose arrival day is today are removed from transit
   and added to the destination market as one lot owned by the shipping building.
3. Market clearing and settlement for every market (unchanged). Imported lots clear
   and settle like domestic lots; their seller is the foreign building.
4. **Trade dispatch** (after settlement *and* the fiscal phase, before training): the
   fiscal phase requires the settlement posting boundary to be unchanged, so dispatch
   cannot run between settlement and fiscal. It is still in the open period and before
   the month-end close. Monthly quota/memo reset on the first civil day; then, for each
   authored route direction in ascending market id order and each good in ascending id
   order, compute landed cost, available surplus, capacity, quota, and shipper cash,
   and create shipments with freight/duty postings in one atomic batch. A building that
   cannot fund freight plus duty draws on its owner's cash as an explicit capital
   injection; if neither has cash, it ships less or not at all.
5. Fiscal, training, education, subsidy, business tax, construction, debt, needs,
   unrest, wealth, close (unchanged). Duty revenue is already in the treasury and the
   customs revenue account when the close runs.

## 5. Accounting summary

| Flow | Posting | Effect |
|---|---|---|
| Freight | building `freight-expense` debit / `operating-cash` credit; `system-reserve-cash` debit / `system-income` credit | Cash-neutral payment for a real service; reduces shipper profit |
| Owner working capital | building `operating-cash` debit / building `owner-equity` credit; owner cash credit / owner `owner-equity` debit (`owner-capital-injection`) | Cash-neutral equity injection when the enterprise cannot prepay freight/duty; never a loan or receivable |
| Customs duty | building `customs-duty-expense` debit / `operating-cash` credit; destination `treasury-cash` debit / `customs-duty-revenue` credit | Cash-neutral tax on an actual dutiable shipment; treasury gains, foreign shipper pays |
| Goods | origin lot decreases at dispatch; in-transit quantity; destination lot increases exactly once on arrival | Physical conservation; no goods created or destroyed |
| Reporting | `customsDutyRevenueSUSD` in period/annual fiscal totals; trade memo and last-day report | Fiscal reports show only collected duty; unpaid/cancelled shipments show nothing |

## 6. Scenario/data changes

- `historical_goods.json`: `transportCostPerUnit` becomes a positive provisional
  fraction of each good's base price (it was 0 for the single-market fixtures).
- `markets_1900.json`: each market declares its customs administration
  (`customsCountryTag`), defaulting to the country owning the lowest region id.
- New `historical/trade_routes_1900.json`: authored market pairs with distance and
  base capacity, validated at load; referenced from the scenario `meta.files`.
- Data version `m3-economy-v9`; scenario defaults leave tariffs, quotas, and
  restrictions neutral (free trade) so the authored opening prices and the
  historical trajectory are not rewritten by policy.
- Generated worker scenario and app worker bundle are regenerated.

## 7. Explicit deferrals

Trade agreements/market access, export incentives, non-simulated rest-of-world
endowment, FX conversion/external accounts, infrastructure construction/investment,
multi-hop route search, merchant enterprises, and in-transit spoilage are deferred.
None is required by §17A.13.2 or §17A.14 E6a; each has a recorded reason. No E6b or
M10 mechanic is implemented.
