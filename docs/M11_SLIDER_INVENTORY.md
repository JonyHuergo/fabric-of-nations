# Slider inventory

Complete player-facing numeric-control inventory, written for M11 and checked against
the current screens (D-145). Continuous or bounded numeric values use `SliderField`
(slider + precise numeric field); the table also records deliberate exceptions.

Since P3 (D-141) a money slider is given the player's `MoneyFormat`: it moves in round
units of the display currency and reports the amount back in RUSD, so the RUSD bounds
below are the authoritative ones and the screen shows them converted.

The authoritative action is sent on release (or on the numeric field's commit)
through `APPLY_ACTION`. Slider ranges are UI subsets of the authoritative
validation; the worker remains the final validator.

## Sliders

| Screen | Control | Min | Max | Step | Unit | Action |
|---|---|---:|---:|---:|---|---|
| Budget | Personal income tax rate | 0 | 60 | 0.5 | % | `set-fiscal-policy.incomeTaxRate` (0–1) |
| Budget | Income-tax exemption | 0 | max(1,000, taxable daily base × 365) | 100 | RUSD/yr | `set-fiscal-policy.incomeTaxAllowanceRUSDPerYear` |
| Budget | Business-profit tax rate | 0 | 50 | 0.5 | % | `set-fiscal-policy.businessProfitTaxRate` |
| Budget | Welfare budget | 0 | max(10,000,000; treasury × 0.5) | 100,000 | RUSD/yr | `set-fiscal-policy.welfareBudgetRUSDPerYear` |
| Budget | Welfare eligibility ceiling | 0 | 99 | 1 | wealth level | `set-fiscal-policy.welfareMaxWealthLevel` |
| Budget | Treasury reserve target | 0 | max(1,000; treasury) | 1,000 | RUSD | `set-fiscal-policy.reserveTargetRUSD` |
| Budget | Borrow principal | 0 | debt headroom | 1,000 | RUSD | `issue-debt.amountRUSD` |
| Budget | Outstanding-principal ceiling | 0 | max(1,000,000; current ceiling × 2) | 100,000 | RUSD | `set-debt-policy.maxOutstandingPrincipalRUSD` |
| Budget | Repay principal (per contract) | 0 | contract outstanding | 100 | RUSD | `repay-debt.amountRUSD` |
| Trade | Tariff rate (per good) | 0 | 100 | 0.5 | % | `set-trade-policy.tariffRates` (0–1) |
| Trade | Monthly import quota (per good) | 0 | observed stock + 30 days capacity (or current quota) | 1% of max | good unit | `set-trade-policy.importQuotaQuantity` |
| Politics | Administration funding | 0 | cash-limited ceiling (preview) | 1% of max | RUSD/yr | `set-institution-funding.annualRUSD` |
| Technology | Education funding | 0 | cash-limited ceiling (preview) | 1% of max | RUSD/yr | `set-education-funding.annualRUSD` |
| Technology | Research staff share | 0 | 1 | 0.01 | share | `set-research-staff-share.share` |
| Labor | Annual training budget | 0 | practical max(treasury × 0.5, current × 2) | 1% of max | RUSD/yr | `set-training-budget.annualRUSD` |
| Labor | Annual stipend per trainee | 0 | max(10,000; current × 2) | 1% of max | RUSD/yr | `set-training-stipend.annualRUSD` |
| Labor | Academic staff share for training | 0 | 1 − research staff share | 0.01 | share | `set-training-staff-share.share` |
| Labor | Health staff share of administration | 0 | 1 | 0.01 | share | `set-health-staff-share.share` |
| Industry | Sector subsidy rate (5 sectors) | 0 | 100 | 0.5 | % | `set-industrial-policy.sectorSubsidyRates` |
| Industry | Public-enterprise capital support (per enterprise) | 0 | treasury cash | 1% of max | RUSD | `support-public-enterprise.amountRUSD` |
| Money | Parity | reference × 0.5 | reference × 1.5 | 1% of reference | RUSD/unit | `set-monetary-policy.parityRusdPerUnit` |
| Money | Reserve transfer (signed) | −reserves | treasury cash | 1% of range | RUSD | `set-monetary-policy.reserveTransferRUSD` |
| War | Recruitment personnel | 1,000 | 25% of the recruiting province's population | 1,000 | soldiers | `recruit-army.personnel` |

`SliderField` also provides threshold ticks, min/max labels, the live value,
step buttons and the platform accessibility increment/decrement actions. The
numeric field accepts a typed value and clamps it to the slider range.

## Deliberate non-slider inputs

### Categorical / discrete

- Country and territory selection (map/list), market selection, province and
  project-type selection, army and deployment-province selection, target country,
  casus belli.
- Law proposals/repeals, technology/research selection, construction project
  type, public-enterprise selection.
- Monetary regime (`pegged`/`managed`) and the refinance-on-maturity toggle.
- Export restriction (boolean per good), construction pause/resume, save/load,
  confirmation dialogs.
- Simulation speed (1/3/10/30) — a discrete game-speed choice, not a policy
  variable; day step and pause are commands.
- Calendar navigation and the new-game date confirmation.

### Numeric exceptions kept as text

| Screen | Control | Why |
|---|---|---|
| Money | Currency conversion (signed RUSD) | The positive bound is the external counterparty's RUSD cash and the negative bound includes the external currency holding; neither is in the snapshot, so a slider could not cover all valid values without admitting invalid ones. It remains a typed value committed through the same validated action. |
| Construction | — | The current screen has no level or quantity input; project type and region are categorical. |

### Read-only or derived values

Country ids, region ids, market ids, contract ids, account ids, dates,
population counts, prices, stock, capacity, treasury/debt balances and other
observed values are display-only and are never slider-controlled.

## Race and precision policy

- `useDeferredCommit` keeps one action in flight per field. While the worker is
  busy, the latest value is retained and sent when the pending action settles;
  older intermediate values are discarded.
- Sliders are disabled while the worker is unavailable or a required country is
  not the player country.
- The numeric field allows exact values for cases where dragging is imprecise.
- Rapid changes within one field cannot overwrite a newer value with an older
  one. Each field has its own queue; independent fields can still be edited in
  sequence, and the worker's busy gate serializes their actions.
- A pending slider value is not automatically discarded when a save is loaded
  during the drag; this narrow edge case is documented as a known limitation.
- A slider range is a UI subset. Examples: the income/business tax sliders span
  0–60%/0–50%, but an enacted taxation law can set a lower statutory cap; values
  above that country's cap are rejected by the worker with an explicit error. training budget/stipend maxima are
  practical ranges below the 1e15 statutory bound; health staff share starts at 0
  even though an enacted health law may impose a higher statutory floor, which the
  worker still enforces and reports as an action error; the recruitment maximum is
  25% of the region population rather than the full eligible pool.
