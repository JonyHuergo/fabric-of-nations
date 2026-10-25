# GDD v2.3 — Change Report

**Status:** documentation-only revision; uncommitted for review.\
**Authoritative document:** `Century_GDD_v2.3.md`\
**Supersedes:** `Century_GDD_v2.2.md` (retained as historical)\
**Implementation baseline:** accepted M0–M4a-2; M4a-2 commit `d6bbfd965a67d04107e73cb4a2c43d4c47d1f3bd`, parent M4a-1 commit `d809f1cc0512bac2b4c543949df86af502efb243`\
**Change date:** 2026-10-25

## Purpose

This revision reconciles the authoritative design document with the committed
M4a-1 accounting foundation and M4a-2 country/currency model. It preserves the
long-term design intent, the historical v2.2 document, determinism/conservation
rules, future monetary-system goals, and the unverified mobile-performance status.
It does not turn current implementation restrictions into permanent design
commitments.

Implementation baseline versions are schema 7, simulation version 0.7.0, save
format 1, and data version `m3-economy-v1`. This documentation revision does not
change any of them.

## Summary of changes

| Area | Change | Supporting evidence |
|---|---|---|
| Revision header and authority note | Version 2.3; v2.3 supersedes v2.2; records the accepted M0–M4a-2 baseline and explicitly leaves M4b and later milestones unimplemented. | Commits `d809f1c`, `d6bbfd9`; D-044/D-045/D-046 |
| §4.2 daily staging | States that country/currency/valuation state is staged with the world but has no daily monetary, FX, inflation, issuance, or regime-transition phase. | M4a-2 implementation; daily pipeline unchanged |
| §5.2 primitive types and SUSD | Replaces “nominal simulated USD” with a fixed unit of measurement/accounting denomination; distinguishes nominal SUSD from future real values; states that SUSD is not registered, issued, or adopted in M4a-2 and does not imply pegs. | D-044; M4a-2 model |
| §5.4 runtime interfaces | Adds `World.currencies` and `World.currencyValuations`; marks `World.countries` current; removes `Region.countryId`; replaces `Country.currency: CurrencyState` with `Country.monetary`; adds `Currency`, `CurrencyIssuer`, `MonetaryArrangement`, `SusdPerCurrencyUnit`, and `CurrencyValuation`; marks future Country fields. | `packages/sim/src/economy/types.ts`, `country.ts` |
| §5.4 current baseline | Replaces the schema-5/M0–M3f baseline with schema 7/M0–M4a-2; records current Country/Region, M4a-1 account/finance shapes, and absent future collections. | `WORLD_SCHEMA_VERSION = 7`, `SIM_VERSION = "0.7.0"`, M4a-1 D-046 |
| §5.4.1 current model | Adds the authoritative M4a-2 rules for issuer identity, `own`/`adopted`, issue-one/adopt-another, one-issued-currency scope restriction, foreign adoption, unused simulated-issued currency, one valuation per currency, specified/unavailable valuation, cross-rate direction, and SUSD exclusion. | `country.ts` validation; `currency.ts` conversions; D-044/D-045 |
| §5.4 historical note | Retains the v2.2 `CurrencyState`/`fxToUSD` target only as explicitly superseded historical context. | v2.2 preserved |
| §5.5 supporting contracts | Updates the current finance description and the `FinancialAccount` category/subtype shape; marks debt contracts, period summaries, and audit-buffer fields as future. | M4a-1 D-046 |
| §8.1–§8.2 accounting | Records M4a-1 double-entry accounts, normal-side balances, recognition legs, and opening balances; records M4a-2 identity/valuation without native-currency balances or a second ledger; labels period summaries and debt as future. | M4a-1 D-046; M4a-2 D-044/D-045 |
| §8.3–§8.7 public finance | Labels taxes, government spending, and debt as future systems whose milestone ownership is not assigned by this revision; distinguishes current M4a-2 identity/valuation from future inflation, FX regimes, monetary policy, central banking, and gold convertibility; updates finance invariants. | D-044/D-045; current implementation |
| §14.4 performance | States that current M2.1/M3f Node benchmarks also exercise worlds carrying the M4a-1/M4a-2 state schema; the mobile p95 target remains **NOT EVALUATED**. | README/DECISIONS benchmark record |
| §15.1 data | States that no country/currency historical dataset is shipped; M4a-2 uses scenario-provided state and inline test fixtures only. | M4a-2 fixtures; data package unchanged |
| §17 milestones | Splits the M4 row into accepted M4a-1/M4a-2 foundations and future M4b/finance work; adds §17.2 accepted-stage table; M4b is not started and has no newly defined acceptance criteria. | Commits `d809f1c`, `d6bbfd9` |
| §20 decisions | Updates the SUSD/accounting decisions; adds country/currency identity to the fixed-decision register; distinguishes the one-issued-currency scope restriction from the foreign-adoption validation rule; updates the handoff baseline to M0–M4a-2. | D-044/D-045 |
| §21 glossary | Defines SUSD as a fixed measurement unit; adds currency issuer, domestic monetary arrangement, currency valuation, `SusdPerCurrencyUnit`, nominal SUSD, real purchasing power, and country-region ownership; updates “Current implementation.” | D-044/D-045; M4a-2 model |
| README | Links to v2.3 as current authority and retains v2.2 as historical. | Documentation link |
| DECISIONS | Notes that v2.3 now supersedes v2.2 for this alignment and that v2.3 records the M4a-1/M4a-2 baseline as current; decision history is preserved. | D-032, D-044–D-046 |

## Superseded currency model and replacement

**Superseded v2.2 target:** `Country.currency: CurrencyState`, where
`CurrencyState` carried `regime`, `fxToUSD` (local currency units per USD),
`inflationIndex`, `goldReservesOunces`, `centralBankAccountId`, and
`moneySupplySUSD`; `Region` also carried `countryId`.

**Replacement (M4a-2):**

- `World.countries`, `World.currencies`, and `World.currencyValuations` are
  authoritative.
- `Country.monetary` is the sole domestic monetary arrangement; there is no
  top-level `Country.currencyId`.
- `Country.regionIds` is the sole country-to-region ownership mapping; there is no
  `Region.countryId`.
- `Currency.issuer` is issuer identity. A country may issue one currency and
  adopt another; adoption does not change the issuer.
- `CurrencyValuation` is either `specified` (`susdPerUnit`, `setOnDay`,
  `source: "scenario"`) or explicitly `unavailable`.
- `susdPerUnit` is the SUSD value of **one unit** of the currency. Cross rates are
  derived as `crossRate(from, to) = from.susdPerUnit / to.susdPerUnit`, giving
  units of `to` per one unit of `from`.
- `fxToUSD` is not an implemented field or inverse-rate convention. The v2.2
  monetary-regime fields remain future goals, not current state.

## Implemented, provisional, and deferred

**Implemented in the accepted baseline:**

- M0–M3f foundation and integrated economic day.
- M4a-1 category-aware double-entry accounts, normal-side balances, opening
  balances, and recognition legs. M3 cash outcomes are unchanged.
- M4a-2 runtime country/currency identity, `own`/`adopted` arrangements,
  one-issued-currency restriction, foreign-adoption rule, one valuation per
  currency, specified/unavailable valuations, derived cross rates, and
  `Country.regionIds` ownership.
- Schema 7, simulation version 0.7.0, save format 1, data version
  `m3-economy-v1`; schema-6/simulation-0.6.0 saves are rejected.

**Current implementation restrictions / provisional assumptions:**

- At most one issued currency per simulated country is a current scope
  restriction (D-045), not a permanent design commitment.
- A foreign-issued currency must be adopted by at least one country under the
  current M4a-2 validation rule (D-045).
- Currency rate bounds and relative tolerance are provisional numerical safety
  choices, not calibrated economics.
- M4a-2 country/currency tests use inline fixtures; no invented historical
  country/currency assignments or synthetic rates are shipped in scenario data.
- Unassigned regions and zero-region countries are permitted by the current
  model.

**Deferred:**

- M4b period close and finance summaries; no M4b acceptance criteria or scope
  expansion is defined here.
- Taxes, government expenditure, debt/interest/maturity, inflation, dynamic FX,
  monetary policy, central banking, monetary issuance, native-currency balances,
  legal-tender enforcement, gold convertibility, currency unions, redenomination,
  and currency conversion during market settlement.
- Any future country/currency historical dataset and calibration.

## Decisions versus restrictions

- **Accepted decisions:** D-044 fixes SUSD as the unit of measurement and rejects
  `fxToUSD`/default parity; D-045 records the country, issuer, arrangement,
  valuation, region-ownership, and SUSD-exclusion model; D-046 records M4a-1
  accounting. These are the authoritative decisions.
- **Current implementation behavior:** validation enforces one arrangement per
  country, one issued currency per simulated country, foreign adoption, one
  valuation per currency, and rejection of shared/union representations.
- **Scope restriction:** the one-issued-currency limit is explicitly labeled as a
  current restriction, not a permanent design commitment.
- **Deferred:** the GDD preserves future monetary regimes, inflation, FX,
  central-bank, debt, and fiscal design as future goals without claiming they are
  implemented.

## Validation

- `Century_GDD_v2.2.md` remains byte-for-byte unchanged; its Git blob is
  `a392994d507d563a12a61d54608c8076466e33c0` and its SHA-256 is
  `416671BC50E727888AFDF382F0D8BE5DE8F3DE304754221CB7CFDCA88CF470D1`.
- Only documentation files were changed: `Century_GDD_v2.3.md`,
  `GDD_V2.3_CHANGE_REPORT.md`, `README.md`, and `DECISIONS.md`.
- No simulation source, tests, data, benchmark/runtime files, schema/version
  constants, lockfile, or save format were changed.
- No simulation tests, typecheck, benchmark, or CI were run for this
  documentation-only revision; they were not required and are not claimed.
- `git diff --check` is clean.
- The v2.3 document was searched for stale current-model claims; remaining
  `CurrencyState`/`fxToUSD`/`Region.countryId` references are explicitly
  historical, negative, or decision-history references.
- README links, version labels, and internal section references were checked.

## Stop condition

Documentation only. M4b and later milestones were not started. The revision is
left uncommitted for review.
