# GDD v2.15 change report — E6a Transport, Access, and Inter-market Trade

This report records the E6a implementation delivered against `Century_GDD_v2.15.md`
(authoritative), `DECISIONS.md` D-079, and the E6a scope in §17A.8, §17A.8.1–§17A.8.3,
§17A.13.2, §17A.14, and §17.5. It is the E6a code/data/tests/documentation change; it
does not start E6b or M10.

## 1. Scope delivered

- **Transport and access.** Authored, validated `TradeRoute` market pairs with a
  provisional distance and base daily cargo-value capacity. Effective capacity is
  `base × (0.5 × origin infrastructure + 0.5 × destination infrastructure)` using the
  existing M8 `Region.infrastructure`; freight is `quantity × good
  transportCostPerUnit × distance`; transit is `ceil(distance)` civil days. A market
  pair with no route cannot trade. Routes are persisted state, validated against the
  market set, and there is no multi-hop routing.
- **Inter-market trade.** After clearing/settlement and the fiscal phase, a producing
  building's remaining domestic stock is real surplus. It may consign goods to another
  market when the destination price covers origin value plus freight, duty, and a 5%
  provisional margin. The seller keeps ownership in transit; goods are in no market's
  stock until they arrive, and arrival adds exactly one destination lot. Quantity is
  capped by origin stock, route capacity, the destination quota, and enterprise/owner
  cash. The dispatch phase must follow the fiscal phase because the fiscal phase
  requires the settlement posting boundary to be unchanged; it is still in the open
  period and before the monthly close.
- **Customs boundary.** `Market.customsCountryId` is the market's customs
  administration (validated to own a member region). A shipment between different
  administrations is dutiable; the ad-valorem duty by good is charged once at dispatch
  on the origin-market cargo value and paid by the shipper to the destination treasury.
  Intra-market pooled allocation stays shared-market clearing and is never dutiable.
- **Trade policy.** One validated `set-trade-policy` action sets a per-good tariff
  schedule, a monthly physical import quota with a deterministic month-to-date counter,
  and per-good export restrictions. The action is rejected in worlds with no authored
  routes, is player-only, and is validated at the protocol, action, and world
  boundaries.
- **Accounting.** `trade-freight`, `customs-duty`, and (when needed) an
  `owner-capital-injection` working-capital injection are balanced and cash-neutral.
  Duty revenue appears in the period and annual fiscal totals as
  `customsDutyRevenueSUSD` and increases the net fiscal result; nothing is booked
  unless a shipment actually incurred and settled the charge.
- **Worker/UI.** Protocol 11 adds the trade action and snapshot contract. The country
  snapshot gains a trade section (tariff/quota/restriction policy, administered
  customs markets, month-to-date exports/imports/duty/freight); the market snapshot
  gains customs administration and infrastructure; the top-level snapshot gains the
  bounded route/in-transit/last-day network. A new Trade tab separates observed state
  from estimates, shows why shipments are blocked, and applies policy through the
  worker.
- **Persistence.** World schema **24**, simulation **0.24.0**, save format **1**, data
  version **`m3-economy-v9`**, worker protocol **11**. Older saves and protocol-10
  clients are rejected; no migration is implemented (D-013).

## 2. E5 closure review

The repository was verified at `fd8a92cd538f3f45cfe969f980856e1ea5f4e9b4`
with a clean working tree, matching the reported E5 final HEAD. The E5 labor suite
(11 tests) and the M5 migration/world/E5-worker suites (23 tests) passed before any
E6a edit. The M8 trade law remains the migration border-policy path and is not reused
for goods; M5 migration still conserves population; M9 qualification/literacy state is
untouched; M8 `Region.infrastructure` is the sole infrastructure input; market clearing
and settlement are unchanged. **No mandatory E5 acceptance failure was found and no E5
remediation was required.** One narrow validation extension permits foreign-owned
imported stock lots only in trade-enabled worlds (D-079 §8).

## 3. Verification

Verified with non-benchmark commands only. No benchmark, performance measurement, full
campaign, stress/soak run, or benchmark-invoking `pnpm run ci` was executed under the
standing no-benchmark restriction. A benchmark entry (`packages/bench/src/e6aBench.ts`,
registered in `bench.ts`) was added and typechecked but **not run**; no benchmark
threshold or result report was modified.

| Command | Result |
|---|---|
| `pnpm run typecheck` | Pass: all six typechecked workspace packages |
| `pnpm run lint` | Pass: boundary checks on 180 TypeScript files (58 in `packages/sim`) |
| `pnpm test` | Pass: **68 suites / 727 tests** |
| `pnpm -F @century/tests test -- e6a-trade` | Pass: **19 E6a tests** |
| `pnpm run check:worker` | Pass: generated scenario and app worker bundle current |
| `git diff --check` | Clean (exit 0; line-ending warnings only) |

Focused E6a tests cover: route canonicalization/validation and no-route worlds;
capacity scaling with both markets' infrastructure and distance-derived transit;
dispatch stock removal, one-time duty and freight postings, treasury/customs/system
balances, and exact-once arrival; repeated-dispatch idempotency; owner-funded working
capital; one origin lot offered to two destinations (no double commitment);
insufficient funds; quota capping and exhaustion; export restrictions; route capacity
capping cargo value; action validation and AI rejection; customs revenue in monthly
fiscal totals only when collected; integrated-day validity over 20 days; world hash
determinism; save round-trip and previous-schema rejection; the worker snapshot and
protocol boundary; and the structural separation of construction procurement from
customs postings.

## 4. Important decisions and limitations

The full decision record is D-079. Key limits:

- Route distances/capacities and freight rates are provisional authored content, not
  historical freight measurements. Capacity is a cargo-value budget because no per-good
  weight/volume exists.
- The M5 sample's markets are multi-polity trade zones with one customs administration
  each, so a member polity that does not administer a frontier shares the zone's
  external tariff. Intra-market cross-country purchases remain pooled and undutiable.
- Trade is producer consignment: there is no merchant/importer entity, trade finance,
  insurance, re-export/entrepôt trade, in-transit spoilage, multi-hop routing,
  retaliation, or agreement dynamics.
- Enterprises distribute all profit monthly in the sample and are often cash-poor, so
  trade charges are funded by the owner as a capital injection when necessary; if
  neither enterprise nor owner has cash, the shipment does not happen.
- Infrastructure quality is scenario-initialised; the player cannot yet build or
  upgrade transport infrastructure.
- Deferred: trade agreements/market access, export incentives, non-simulated
  rest-of-world endowments, FX/external accounts, infrastructure construction, and
  in-transit spoilage. None is required by the E6a definition of done.

## 5. Files changed

Implementation: `packages/sim/src/economy/trade.ts` (new), `types.ts`, `constants.ts`,
`accounts.ts`, `accounting.ts`, `validation.ts`, `state.ts`, `day.ts`, `ai.ts`,
`period.ts`, `production.ts`, `construction.ts`, `index.ts`;
`packages/sim/src/world.ts`, `serialization.ts`, `constants.ts`,
`population/state.ts`; `packages/sim-worker/src/protocol.ts`, `snapshot.ts`,
`actionHistory.ts`, `tradePreview.ts` (new), `index.ts`;
`packages/bench/src/e6aBench.ts` (new), `bench.ts` (registration only);
`packages/app/src/screens/TradeScreen.tsx` (new), `App.tsx`; generated worker scenario
and app worker bundle. Data: `packages/data/src/historical.ts`,
`data/historical_goods.json`, `data/historical/markets_1900.json`,
`data/historical/trade_routes_1900.json` (new), `data/scenarios/*.json`,
`data/politics.json`, `data/technology.json`, `src/version.ts`.
Tests: `packages/tests/src/e6a-trade.test.ts` (new), `fixtures/m5.ts` (data version),
`m7-supervisor.test.ts` (snapshot fixture). Docs: `Century_GDD_v2.15.md`,
`DECISIONS.md` D-079, `docs/E6A_REQUIREMENTS_MAP.md`, this report, `README.md`.
