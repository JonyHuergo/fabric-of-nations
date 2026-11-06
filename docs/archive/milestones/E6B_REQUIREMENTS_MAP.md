# E6b — Monetary, Foreign-Exchange, and Price-Measurement Systems: requirements map

Status: **implemented record for E6b** (GDD v2.16 §17G, D-080). It maps the authoritative
GDD v2.16 §17A.10, §17A.10.1–§17A.10.4, §17A.13.2 E6b, §17A.14 E6b, §17.3 M8a, and
§17A.16 to code paths, authoritative state, simulation phases, player actions,
accounting, and tests. Decisions are recorded in D-080. The GDD is authoritative;
deferrals are listed in §7 and are permitted by the E6b definition of done.

## 0. Focused E6a closure review (non-benchmark)

Repository verified at `a702472f42d5acb936919a4c2ecef96bdc76b3f7`, clean working tree,
matching the reported E6a final HEAD. Before any E6b edit: `pnpm -F @century/tests
test -- e6a-trade` (19 tests) passes.

- **Balanced trade postings.** Freight (`trade-freight`), duty (`customs-duty`), and
  working-capital injections (`owner-capital-injection`) are structurally validated and
  cash-neutral; `assertValidWorld` checks the accounting identity and designated-cash
  conservation.
- **Dispatch/transit/delivery vs cash and goods.** Dispatch removes origin stock and
  posts freight/duty once; arrival adds exactly one destination lot and moves no money;
  sale revenue settles in SUSD through normal clearing. Goods and cash are conserved.
- **Tariffs charged once.** Duty is posted only at dispatch, never again on arrival; a
  repeated dispatch for the same day is an idempotent no-op; the phase restores state on
  failure.
- **SUSD expression.** Every price, cargo value, freight, duty, and account is SUSD;
  `susdPerUnit` is only a valuation input and no FX conversion is applied in trade.
- **Foreign ownership and customs.** Foreign-owned imported lots and the customs
  administration mapping are explicit and validated.
- **Foundation for currency conversion and external accounts.** The E6a monetary gaps
  are exactly what E6b owns: no external account, no monetary authority, no dynamic
  valuation, no price index. E6a's `CurrencyValuation` and `Country.monetary` are a
  sound foundation to extend without reimplementing trade.

**Conclusion:** no mandatory E6a acceptance failure exists and no E6a remediation is
required.

## 1. Authoritative E6b criteria

| # | GDD source | Criterion | Existing / new code | E6b model and authoritative state | Player action | Tests |
|---|---|---|---|---|---|---|
| A1 | §17A.10.2.4, §17A.13.2 E6b | Documented inflation/price-level measure from actual prices with basket, weights, base, window | new `monetary.ts`, market prices | `World.priceIndex`: fixed basket (weights from the scenario needs data), per-market base prices captured at world creation (base = 100), derived Laspeyres index per market/country/world, month-end observations (bounded), coverage and missing-price rules | none (measurement) | base normalization, weights, missing price, new good, observations, no behavior change |
| A2 | §17A.10.2.5, §17A.13.2 E6b | Exchange-rate state with unambiguous units and direction; dynamics built on `CurrencyValuation` | `currency.ts`, new `monetary.ts` | `CurrencyValuation.susdPerUnit` remains SUSD per currency unit; per-currency `MonetaryCurrencyState` adds regime, parity, circulation units, reserve/cover, last change; managed regimes update the valuation by a documented bounded rule from realized trade balance and relative price level; pegged regimes change only by an explicit bounded policy parity with a cooldown | `set-monetary-policy` | direction/unit, conversion round-trip, managed rule direction and bounds, pegged parity validation/cooldown |
| A3 | §17A.10.2.6, §17A.13.2 E6b | Law/institution-backed monetary authority with explicit instruments, timing, bounds, authority | M8 law/institution path; new state | Authority exists only for a country issuing its own currency and only when the scenario enables the monetary system; the managed regime requires the enacted currency law; the player is the decision authority and the AI is not implemented | `set-monetary-policy`, `propose-law` | establishment/ownership validation, law-gated managed regime, AI rejection, bounds |
| A4 | §17A.10.2.1–3, §17A.10.4, §17A.13.2 E6b | Balanced money/credit accounting with explicit source/use and counterparts | accounts + new posting kinds | Currency board: `monetary-reserve-cash` (SUSD cash), `currency-liability`, `monetary-equity`, external `external-cash`, `external-currency-holding`, `external-equity`. Reserve transfers are capital contributions; currency issue/redeem exchanges SUSD reserves for currency units with the external counterparty; parity/valuation changes are explicit revaluations (no cash) | `set-monetary-policy` | establishment, conversion, revaluation, cash conservation, identity, rollback |
| A5 | §17A.10.4, §17A.8.3, §17A.13.2 E6b | Policies act through defined channels, not arbitrary adjustments | E6a dispatch, monetary phase | Convertibility is derived from real reserves relative to realized imports; when it is suspended, imports into the country's market are blocked in E6a dispatch (`fx-convertibility`). Managed valuation moves only through the documented flow/price rule; parity is a bounded policy decision with a cooldown | `set-monetary-policy` | suspension blocks imports, restoration after reserve/parity action, no goods creation |
| A6 | §17A.10.2.7, §17A.13.2 E6b | Country-appropriate powers; no universal modern fiat; missing prerequisites explicit | `Country.monetary`, scenario input | Only own-currency countries have an authority; adopted/shared currencies have none. No bank credit, deposits, policy rate, lender of last resort, external debt, or domestic currency-denominated accounts; recorded as explicit prerequisites | `set-monetary-policy` | adopted currency rejected, disabled system inert |
| A7 | §17A.10.1 | SUSD contract preserved; nominal vs real vs FX distinguished | existing ledger, new index | SUSD remains the fixed unit of account; accounts stay SUSD; the index is a derived measurement; FX is a valuation of currency, never a rescaling of SUSD or accounts | — | no account rescaling, closed periods untouched |
| A8 | §17A.15 | Deterministic, bounded, versioned, validated, persisted, atomic | serialization/validation | Plain state, ascending-id ordering, no RNG, bounded observations and records, schema/protocol/data bumps, idempotent phases, restore-on-failure | — | determinism/replay, save round-trip, rejection, malformed action |

## 2. Implemented instruments

| Instrument | E6b status | Real mechanism |
|---|---|---|
| Inflation / price-level measurement | implemented | Laspeyres index from actual market prices over a fixed needs-derived basket; base-100 at scenario start; bounded month-end observations; country and world measures |
| Exchange-rate state and managed dynamics | implemented | `susdPerUnit` valuation; managed rule driven by realized trade balance and relative price level; bounded daily change |
| Pegged parity policy | implemented | Bounded parity change with cooldown; revalues the currency liability and external holdings through explicit equity revaluation |
| Monetary authority and currency board | implemented | Reserve-backed authority, capitalization from the treasury, currency issue/redeem against reserves, reserve-cover convertibility |
| Convertibility and import effect | implemented | Derived reserve cover vs. realized imports; suspension blocks imports into that market |
| Currency law (managed regime) | implemented | Currency-slot law via the M8 pathway enables a managed regime |
| Bank credit, deposits, policy rate, interest channel | deferred | No banking/deposit model; recorded as a missing prerequisite, not faked |
| Domestic currency-denominated cash and prices | deferred | Domestic accounts remain SUSD; FX is an external/monetary valuation, not a domestic ledger rescale |
| External debt / reserves in foreign assets | deferred | No external debt instrument or foreign-asset portfolio exists |

## 3. Authoritative state summary

- `World.priceIndex`: basket (good, weight), per-market base prices, bounded month-end
  observations (world + per country), last observation day.
- `World.monetary`: enable flag, per-currency authority state (issuer country, regime,
  parity, circulation units, reserve-cover inputs, last parity change, last managed
  update, realized month imports), account ids, last update day.
- `CurrencyValuation` remains the single authoritative SUSD-per-unit valuation; its
  `source` extends to `scenario | policy | market` as provenance.
- Finance: six new account subtypes and four posting kinds
  (`monetary-reserve-contribution`, `fx-issuance`, `fx-redemption`, `fx-revaluation`).
- Scenario: optional `monetary` block with per-currency initial authority state;
  sample enables the system but activates no authority because its currency valuations
  are explicitly unavailable (no invented historical rates).

## 4. Ordering and timing

1. Market clearing and settlement (unchanged).
2. Fiscal and E6a dispatch (unchanged).
3. **Monetary phase** (after dispatch, before the monthly close): managed valuation
   update and revaluation (daily, idempotent per day); at a civil month-end, capture
   realized imports and append the price-index observation exactly once.
4. Training/education/subsidy/business tax/construction/debt (unchanged).
5. Needs/unrest/wealth/close (unchanged). Closed periods and their nominal values are
   never rewritten.

## 5. Accounting summary

| Flow | Posting | Effect |
|---|---|---|
| Reserve capitalization / withdrawal | country `owner-equity` debit / treasury cash credit; authority `monetary-reserve-cash` debit / `monetary-equity` credit (reverse for withdrawal) | Real treasury cash moves into/out of the authority as capital; cash-neutral |
| Currency issue (`fx-issuance`) | authority reserve-cash debit / `currency-liability` credit; external `external-currency-holding` debit / `external-cash` credit | SUSD reserves and currency units exchange; cash-neutral; explicit counterparts |
| Currency redemption (`fx-redemption`) | reverse of issuance, bounded by reserves and external holdings | Cash-neutral; no negative balances |
| Revaluation (`fx-revaluation`) | liability and monetary equity adjust; external holding and external equity adjust in the opposite direction | Valuation change only; no cash, no goods; closed periods untouched |

## 6. Scenario/data changes

- `politics.json`: one currency-slot law (`currency-managed-standard`) with a validated
  `currencyRegime` field; `IMPLEMENTED_LAW_SLOTS` gains `currency`.
- Scenario monetary input (optional): per-currency regime, parity, reserve funding,
  initial circulation, external counterparty balances. The M5 sample enables the system
  with no active authority and no invented rate.
- Data version `m3-economy-v10`.

## 7. Explicit deferrals

Commercial banks/deposits/bank credit, a policy interest rate and interest channel,
lender-of-last-resort, external debt, foreign-currency public debt, full domestic
currency-denominated ledgers, FX order books/markets, capital controls beyond the
reserve-cover convertibility rule, and inflation indexation of wages/contracts are
deferred. Each is recorded with its missing prerequisite; none is required by the E6b
definition of done, which requires the monetary foundation, balanced accounting,
defined channels, and explicit missing prerequisites. No M10 work is implemented.
