# Century — GDD v2.11 Change Report (E4)

- **GDD:** `Century_GDD_v2.11.md` (authoritative); v2.10 retained byte-for-byte.
- **Revision date:** 2026-10-27
- **Baseline:** E3 documentation commit `e0c591c54a4284d72dfa5a256a2762ad9619e035`
- **Implementation:** code/tests/bundle commit `a859f2a89c8229fa12c9c57b7862307140fb721d`
- **Scope:** E4 — Industrial and Business Policy only. E5–E6 and M8a are not implemented.
- **Projection:** no benchmarks, performance measurements, campaigns, profiling, or
  device tests were run, per the developer's active no-benchmark restriction.

## 1. Source-defined E4 scope and acceptance criteria

GDD §17A.7/E4 requires a coherent subset of industrial-development instruments that
changes actual enterprise behavior, budget flows, production, investment, or material
availability; unsupported instruments must be labelled; fiscal cost and trade-offs must
be visible. The priority order is sectoral subsidy, procurement, public-enterprise
capital/expansion, investment incentives, and industrial programs. Price/production
controls are E7.

E4 delivers the first three components coherently:

1. validated sector classification;
2. construction/commissioning material requirements and actual market procurement;
3. ad-valorem sectoral production subsidies;
4. public-enterprise capital support.

Private co-financing, government-supported private projects, loans, guarantees,
investment tax credits/deductions, general goods/services procurement/open orders,
public-enterprise expansion/discontinuation, industrial program bundles, and price/
production controls are **not implemented** and are labelled in the GDD and UI.

## 2. Validated sector classification

`BuildingDef.sector` is an authored, validated enum: agriculture, food-processing,
textiles, manufacturing, storage. It is added to every building definition, including
historical variants. Subsidy eligibility is derived from this field, not UI labels or
building keys. Data version is bumped to **`m3-economy-v5`** because definition meaning
changes.

## 3. Construction materials and procurement

- Every definition carries `constructionMaterials` with existing good ids and positive
  quantities. These are provisional construction/commissioning inputs (seed, breeding
  stock, netting/packaging, raw materials), not a historical engineering BOM.
- At project authorization, requirements are snapshotted with delivered quantity zero.
- Before labor, the project buys missing quantities from the project region's actual
  market stock at the current price. Market lots are consumed in canonical
  `(goodId, sellerBuildingId)` order. Quantity is limited by requirement, actual lot
  stock, and treasury cash.
- The seller's lot decreases; seller operating cash and `sales-revenue` increase. The
  country debits `construction-in-progress` and credits treasury
  (`construction-material-purchase`). This is cash-neutral and preserves the accounting
  identity.
- Purchase and delivery are atomic; delivered quantities are capped by the requirement,
  so a retried/replayed phase cannot duplicate a purchase or consumption. There is no
  open order/backlog in E4, and no order is counted as stock.
- No stock → `waiting`/`materials`; insufficient cash → `waiting`/`funds`; labor starts
  only after all materials are delivered. Cancellation writes off labor + material
  work-in-progress; completion capitalizes both.

## 4. Sectoral production subsidy

- Country policy stores a validated `sectorSubsidyRates` array covering all sectors
  (scenario default: zero).
- The subsidy phase runs after market/fiscal and before business tax.
- Base: verified daily physical output from the completed production phase, valued at
  the market's post-clearing price.
- Entitlement: `sectorRate × gross output value`.
- Payment is limited by actual treasury cash in ascending building-id order; aggregate
  payment cannot overdraw.
- Paid amount posts country `subsidy-expense`/treasury and building
  `operating-cash`/`subsidy-revenue` (`production-subsidy`), cash-neutral.
- Subsidy revenue is taxable enterprise revenue and is included in the month-end
  business-profit tax base.
- Unpaid entitlement is an explicit `subsidyShortfallSUSD`, never debt, a receivable,
  or cash already received.

## 5. Public-enterprise capital support

`support-public-enterprise` is player-only for an existing state-owned building in the
country's regions and owned by its treasury. The positive, bounded amount must be
covered by actual treasury cash.

Posting: country treasury credit / country owner-equity debit; building operating-cash
debit / building owner-equity credit
(`public-enterprise-capital-contribution`). It is cash-neutral and is a capital
contribution, not expense, a loan, or a guarantee. It does not change ownership,
level, condition, inputs, sales, wages, tax, or M5a remittance rules. It does not
guarantee profitability or continued operation. Expansion/discontinuation remain
deferred.

## 6. Accounting and reporting

| Flow | Posting | Cash |
|---|---|---|
| Construction material purchase | country WIP debit / treasury credit; seller operating cash debit / sales revenue credit | Cash-neutral; market stock decreases |
| Sectoral subsidy | country subsidy expense debit / treasury credit; building operating cash debit / subsidy revenue credit | Cash-neutral; expense/revenue recognized |
| Public-enterprise support | treasury credit / country equity debit; building cash debit / equity credit | Cash-neutral capital transfer |
| Completion | WIP credit / public capital debit for labor + materials | None |

Budget decompositions add `constructionMaterialsSpentSUSD`, `subsidyRequestedSUSD`,
`subsidyShortfallSUSD`, and `publicEnterpriseSupportSUSD`. Fiscal totals add
`subsidyExpenseSUSD`; `netFiscalResultSUSD = incomeTax + businessTax − welfare −
interest − subsidyExpense`. Material outlay is capital, subsidy is expense, support is
capital. Accounting identity and designated-cash conservation hold.

## 7. Ordering, atomicity, and determinism

Daily order: AI → demography/employment/migration → market/settlement → fiscal →
**industrial subsidy** → business tax → **construction (material procurement before
labor/wages)** → debt → needs/wealth → close → M5a distribution. Industrial subsidy
staging publishes finance only after validation; construction stages finance, projects,
buildings, and regions. Market lots are consumed in canonical order; buildings are
processed by ascending building id/project id. Retry/replay cannot duplicate material
delivery. Schema-20 hashes/fixtures change intentionally.

## 8. Schema, protocol, data, and save consequences

- World schema **20**, simulation **0.20.0**, save format **1**, worker protocol **7**,
  data version **`m3-economy-v5`**.
- `Country.industrial`; project `materials`/`materialsSpentSUSD`; project
  `blockedReason` adds `materials`.
- New accounts: building `subsidy-revenue`; country `subsidy-expense`.
- New cash-neutral posting kinds: `construction-material-purchase`,
  `production-subsidy`, `public-enterprise-capital-contribution`.
- New budget/fiscal fields described above.
- Protocol 7 adds sector/material/enterprise snapshot fields and
  `set-industrial-policy` / `support-public-enterprise` DTOs; snapshots remain immutable
  and contain no accounts/postings.
- Data v5 adds sectors/material bills to all building definitions; generated scenario
  and worker bundle regenerated.
- Schema-19/older saves and protocol-6 clients are rejected; no migration is
  implemented under D-013. Bounded state is preserved: fixed sector arrays, authored
  material lists, derived public-enterprise list, no new unbounded history.

## 9. Player workflow and UI

- **Industry tab:** sector rate inputs, current capacity-value estimate, static daily
  subsidy estimate, month-to-date requested/paid/shortfall, constraints; existing state
  enterprises with operating cash and capital-support input; explicit “deliberately not
  implemented” section.
- **Construction tab:** material requirements, current prices, market stock, delivered/
  remaining quantities, estimated material/total investment, material progress, and
  `materials` stalls alongside funds/labor.
- **Ledger:** subsidy expense/shortfall, material capital outlay, and public-enterprise
  capital support reported separately.
- All actions travel through the validated worker protocol; the app reads immutable
  snapshots only.

## 10. Files created or modified

Core: `packages/sim/src/economy/industrial.ts`, `industrialPolicy.ts`,
`construction.ts`, `constructionModel.ts`, `types.ts`, `constants.ts`, `country.ts`,
`state.ts`, `accounts.ts`, `accounting.ts`, `budget.ts`, `period.ts`, `businessTax.ts`,
`validation.ts`, `day.ts`, `ai.ts`, `index.ts`, `world.ts`, `serialization.ts`,
`population/state.ts`, `constants.ts`.

Data/worker/UI: `packages/data/data/buildings.json`,
`historical_buildings.json`, scenarios, `packages/data/src/version.ts`;
`packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `industrialPreview.ts`,
`constructionPreview.ts`, `reports.ts`, `actionHistory.ts`, generated scenario;
`packages/app/src/screens/IndustryScreen.tsx`, `ConstructionScreen.tsx`,
`LedgerScreen.tsx`, `App.tsx`, generated worker, save storage.

Tests/docs: `e4-industrial-policy.test.ts` (new), E3/E2/M7/UI/serialization/hash
updates, `m7-worker`, `m7-supervisor`, `e1-ui-wiring`, `m2-calibration`; GDD v2.11,
D-075, README, this report.

## 11. Verification commands and results

Run under the no-benchmark restriction:

1. `pnpm -F @century/sim typecheck` — pass.
2. `pnpm -F @century/sim-worker typecheck` — pass.
3. `pnpm -F @century/app typecheck` — pass.
4. `pnpm -F @century/tests typecheck` — pass.
5. `pnpm run typecheck` — pass (all packages).
6. `pnpm test` — **61 suites / 649 tests passed** after the final hash update; E4 suite
   contributes 12 tests. The run is correctness only, not a benchmark.
7. `pnpm run lint` — pass.
8. `pnpm -F @century/app build:worker` — regenerated; `worker-bundle-drift` passes.
9. `pnpm run check:worker` — pass (generated scenario/worker artifacts current).
10. `git diff --check` — no whitespace errors.

No `pnpm run bench`, `bench:campaign`, benchmark script/gate, profiling, performance
measurement, stress/soak run, full-campaign run, or `pnpm run ci` was executed. No
benchmark code, thresholds, or reports were modified.

## 12. Limitations and deferred work

- General goods/services procurement, open orders, delayed delivery, supplier contracts:
  deferred.
- Private co-financing, government-supported private projects: deferred (no private
  investor claim/ownership model).
- Loans/guarantees: deferred (no credit/repayment or contingent-liability model).
- Investment tax credits/deductions: deferred (no tax-credit/deduction rules; requires
  private investment).
- Public-enterprise expansion/discontinuation: deferred (no capital/closure model).
- Industrial program bundles: deferred; only component instruments exist.
- Price/production controls: E7.
- E5–E6 labor/social/trade/monetary work remains unimplemented.
- Material bills are provisional authored content using existing goods, not historical
  engineering BOMs.
- Procurement is domestic shared-market stock bought after clearing at the current price; E4 does not add a pre-clearing government-demand tier or a separate price impact. No imports/customs/transport cost (E6a).
- AI industrial/support actions are player-only.
- Native/device verification remains under the M7 exception.
