# GDD v2.16 change report — E6b Monetary, Foreign-Exchange, and Price-Measurement Systems

This report records the E6b implementation delivered against `Century_GDD_v2.16.md`
(authoritative), `DECISIONS.md` D-080, and the E6b scope in §17A.10, §17A.10.1–§17A.10.4,
§17A.13.2 E6b, §17A.14 E6b, and §17.3 M8a. It is the E6b code/data/tests/documentation
change; it does not start M10.

## 1. Scope delivered

- **Price measurement.** One documented Laspeyres index from actual market prices over a
  fixed reference-household basket derived from the scenario need tiers. The base period
  is the scenario's first processed day; each market's opening prices are captured into
  authoritative state and the index is normalized to **100**. Market, country
  (population-weighted across the markets containing its regions), and world indices are
  derived. Missing or non-positive prices are excluded from both sums with reported
  coverage; goods outside the basket are excluded. Month-end observations are appended
  exactly once per day, bounded to 24. Month-on-month and year-on-year inflation are
  reported only when the retained history supports them. The index is measurement only:
  it never changes a price, wage, tax, contract, or account, and never rewrites a closed
  period.
- **Exchange-rate valuation and dynamics.** `CurrencyValuation.susdPerUnit` remains the
  authoritative SUSD-per-unit rate. Each own-currency country with the monetary system
  enabled has a monetary-authority record with a regime (`pegged` default or `managed`),
  a declared parity, a reference parity, the currency in circulation, realized
  month exports/imports, and explicit account ids. A pegged valuation equals its parity;
  the parity changes only through a validated policy action bounded to a maximum relative
  step with a cooldown. A managed valuation follows a documented bounded daily rule driven
  by the most recently completed month's realized net external position and the
  country-to-world price-index ratio, bounded to a band around the reference parity. The
  managed regime requires an enacted M8 currency law.
- **Monetary authority and money accounting.** A reserve-backed currency board per active
  authority: SUSD reserve cash, a currency liability measured at the current valuation, and
  monetary equity, plus an external counterparty's SUSD cash, currency holding, and
  equity. Treasury reserve capitalization/withdrawal, currency issue/redemption against
  reserves, and parity/valuation revaluation are all explicit, balanced, cash-neutral
  postings with named counterparts. No money or currency appears without a counterpart.
- **Convertibility and the E6a channel.** Reserve cover is reserves divided by the most
  recently completed month's realized imports. Below the documented minimum, or with zero
  reserves, convertibility is suspended and E6a dispatch blocks imports into that country's
  customs zone with `fx-convertibility`. Restoring reserves or reducing the liability
  restores imports. Trade, freight, and customs remain SUSD-settled; no value is converted
  twice and goods conservation is unchanged.
- **Player workflow.** One validated `set-monetary-policy` action sets the regime, parity,
  a signed treasury reserve transfer, and a signed currency conversion. It is player-only;
  the AI has no monetary action. A Money tab shows the currency/valuation state with
  units, reserves, cover, convertibility, the price-index definition and measurements,
  the currency table, and estimates labelled as such. A currency law (M8 currency slot)
  enables the managed regime through the existing `propose-law` path.
- **Persistence.** World schema **25**, simulation **0.25.0**, save format **1**, data
  version **`m3-economy-v10`**, worker protocol **12**. Older saves and protocol-11
  clients are rejected; no migration is implemented.

## 2. E6a closure review

The repository was verified at `a702472f42d5acb936919a4c2ecef96bdc76b3f7`, clean tree,
matching the reported E6a final HEAD. `pnpm -F @century/tests test -- e6a-trade` passed
(19 tests) before any E6b edit. Shipment, freight, and customs postings are structurally
validated and cash-neutral; dispatch removes origin stock and posts charges once; arrival
adds exactly one lot and moves no money; tariffs are never charged twice; every trade
value is SUSD; foreign ownership and customs administrations are explicit. E6a left the
monetary gaps E6b owns (no external account, authority, dynamic valuation, or price
index) and its `CurrencyValuation`/`Country.monetary` foundation extended cleanly.
**No mandatory E6a acceptance failure was found and no E6a remediation was required.**

## 3. Verification

Verified with non-benchmark commands only. No benchmark, performance measurement, full
campaign, stress/soak run, or benchmark-invoking `pnpm run ci` was executed under the
standing no-benchmark restriction. A benchmark entry (`packages/bench/src/e6bBench.ts`,
registered in `bench.ts`) was added and typechecked but **not run**; no benchmark
threshold or result report was modified.

| Command | Result |
|---|---|
| `pnpm run typecheck` | Pass: sim, data, sim-worker, app, tests, and bench |
| `pnpm run lint` | Pass: 184 TypeScript files, 59 in `packages/sim` |
| `pnpm test` | Pass: 69 suites / 748 tests |
| `pnpm -F @century/tests test -- e6b-monetary` | Pass: 21 E6b tests |
| `pnpm run check:worker` | Pass: generated scenario and app worker bundle current |
| `git diff --check` | Clean (exit 0) |

Focused E6b tests cover: currency direction/round-trip and missing/unavailable rates;
scenario monetary validation (managed pre-set rejection, treasury funding bound, external
cover, unknown currency); adopted-currency rejection; basket derivation and base-100
normalization; weight-correct index response without account changes; missing-price
coverage and no fabricated price; bounded/idempotent observations and MoM/YoY; no
behavioural effect; opening currency-board balance; devaluation revaluation with no cash
or goods change; issue/redemption counterparts; reserve capitalization/withdrawal;
establishing an inactive authority; parity bounds, cooldown, and AI rejection; the
law-gated managed rule; suspended convertibility blocking E6a imports and restoration
after funding; goods conservation; determinism; save round-trip and previous-schema
rejection; worker snapshot/action and malformed protocol commands.

## 4. Important decisions and limitations

The full decision record is D-080. Key limits:

- The historical sample's currency valuations are explicitly unavailable, so no authority
  is active and no historical exchange rate is invented. The player can establish a
  reserve-backed pegged authority by declaring a parity and transferring treasury cash.
- Domestic accounts, prices, wages, and trade remain SUSD; E6b does not denominate
  domestic ledgers in national currency, so FX transmission to domestic prices/wages is
  limited to convertibility and the authority's balance sheet.
- No commercial banks, deposits, bank credit, policy interest rate, lender of last resort,
  external debt, FX order book, or capital controls beyond the reserve-cover gate. These
  are recorded missing prerequisites, not faked controls.
- The managed-rule coefficients, reserve-cover minimum, parity step, cooldown, and basket
  are provisional structural choices, not calibration.
- `fx-revaluation` and the external accounts are the only valuation layer; no closed
  period or settled transaction is restated.
- M10 remains unimplemented.

## 5. Files changed

Implementation: `packages/sim/src/economy/monetary.ts` (new), `types.ts`, `constants.ts`,
`accounts.ts`, `accounting.ts`, `validation.ts`, `state.ts`, `day.ts`, `ai.ts`,
`trade.ts`, `country.ts`, `politics.ts`, `index.ts`; `packages/sim/src/world.ts`,
`serialization.ts`, `constants.ts`, `population/state.ts`;
`packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `actionHistory.ts`,
`monetaryPreview.ts` (new), `index.ts`; `packages/bench/src/e6bBench.ts` (new),
`bench.ts` (registration only); `packages/app/src/screens/MoneyScreen.tsx` (new),
`App.tsx`; generated worker scenario and app worker bundle. Data:
`packages/data/data/politics.json` (currency law), scenario data versions,
`packages/data/src/historical.ts`, `src/version.ts`.
Tests: `packages/tests/src/e6b-monetary.test.ts` (new), `fixtures/m5.ts` (data version),
`m7-supervisor.test.ts` (snapshot fixture), plus re-pinned known-answer digests.
Docs: `Century_GDD_v2.16.md`, `DECISIONS.md` D-080,
`docs/E6B_REQUIREMENTS_MAP.md`, this report, `README.md`.
