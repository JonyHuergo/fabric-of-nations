# GDD v2.2 — Change Report

**Status:** documentation-only revision; uncommitted for review.\
**Authoritative document:** `Century_GDD_v2.2.md`\
**Supersedes:** `Century_GDD_v2.1.md` (retained as historical)\
**Implementation baseline:** accepted M0–M3f, M3f commit `53610b8`\
**Change date:** 2026-10-25

## Purpose

This revision aligns the GDD with the accepted M0–M3f implementation without
turning temporary implementation limits into permanent game-design decisions. It
preserves the long-term design intent, historical goals, determinism/conservation
rules, future systems, and the unverified mobile-performance status.

## Summary of changes

| Area | Change | Supporting evidence |
|---|---|---|
| Revision header | Version 2.2, 2026-10-25; alignment note identifies M0–M3f as the accepted baseline and explicitly does not claim full v1 implementation. | M3f commit, README, D-042 |
| Authority model | Added **Current implementation** as a requirement status alongside binding, provisional, and future rules. | Documentation alignment |
| §4.2 daily pipeline | Replaced the v2.1 order with the accepted M3f order; marked implemented vs future phases; added whole-day staging/publication, M2-only vs economic-world distinction, cash-safe demand, and future government/tax/interest/debt phases. | D-042, M3f tests |
| §4.2 price placement | Resolved the v2.1 settlement-before-price conflict: bounded price adjustment is part of M3d market clearing before M3e settlement; settlement uses established transaction prices and does not feed back into current-day prices. | D-043 |
| §4.3 allocation | Documented the implemented tier subset (1, 2, 3, 5, 6), seller-attributed lots, same-batch funding, and conservative fallback; preserved future government/export tiers. | D-040, D-042 |
| §4.4 boundaries | Clarified current month-end wealth, January 1 ageing, and future monthly finance/history systems. | D-019, D-042 |
| §5.4–5.5 | Added current schema-5 baseline versus the target runtime contracts: no countries/treaties/armies/event queue/history, stock-lot markets, cash-only finance, current building/employment shape. | Schema-5 implementation |
| §6.4 needs | Retained the M2-only income fixture limitation; documented M3f cash-funded household demand, no same-day wages, tier funding, and absence of government/export/universal-income demand. | D-042 |
| §6.5 wealth | Preserved the wealth concept and target formula; added the shared-time-basis rule: annualized per-capita income must be compared with an annual subsistence basket cost (daily per-capita basket × current prices × 365/366). Recorded the provisional M3f convention: current-day actual settled wage receipts annualized by the actual civil year, current post-market basket prices, zero mandatory payments, and no cash-as-income. Explicitly states that a **trailing-month average is not implemented** and would require a persistent accumulator and save/schema extension. | D-042, wealth tests |
| §7.1 goods | Preserved the fifteen-good v1 target; added the implemented eight-good subset and noted that services and other target goods are not implemented. | Data catalog, D-036 |
| §7.2 buildings | Preserved the thirteen-type v1 target; added the implemented eight-building subset, private-only current ownership, absent technology/resource caps, and the current clothing-workshop meaning. | Data catalog, D-036 |
| §7.3 operation | Distinguished implemented level/condition/staffing/input/storage/funding constraints from future resource, technology, infrastructure, law, and disruption modifiers. | D-039, D-042 |
| §7.4–7.5 markets | Clarified current single-market, seller-attributed stock-lot, no-import/export baseline and preserved the broader market/trade design. | D-040 |
| §7.6 prices | Marked the implemented bounded price update provisional; noted absent inflation/FX/price-level/administered-price mechanisms and unchanged same-day overflow feedback. | D-040 |
| §7.7 wages/profits | Separated the current M3e/M3f base-wage, partial-wage, upkeep, retained cash-basis profit, and household-cash baseline from future wage-index/scarcity/productivity/inflation/law, loss, dividend, state-enterprise, and rent rules. | D-041 |
| §7.8 GDP | Marked national accounts/GDP as future; noted M3f diagnostics are not GDP. | D-041, README |
| §8 finance | Distinguished the implemented M3a/M3e cash ledger and atomic postings from future expense/equity recognition, taxes, government finance, debt, interest, banks, central banks, foreign holders, inflation/FX, and monetary issuance. | D-035, D-041 |
| §8.2 M4 boundary | Clarified that M4 extends the M3 cash-account/posting foundation rather than creating the first accounting interface. | D-035, D-041 |
| §14.4 performance | Updated Node-benchmark caveat to include M2.1/M3f; retained that the mobile p95 target is **NOT EVALUATED** and not met. | README, D-042 |
| §17 milestones | Updated the M3 definition to include the integrated tick; split M3 into accepted M3a–M3f stages with acceptance boundaries; clarified M4’s full finance/public-finance scope. | D-035, D-037–D-042 |
| §20 decisions | Updated daily ordering, wealth convention, M2-only fixture, economic-day atomicity, catalog scope, and handoff baseline; added the trailing-month income-window decision as open. | D-042, D-043 |
| README | Updated the authoritative GDD link to v2.2. | Documentation link |
| DECISIONS | Added D-043 for the approved M3d-before-M3e ordering; noted v2.2 supersession in D-032. | D-043 |

## Daily-order resolution

GDD v2.1 placed settlement before price updates. The accepted implementation
applies bounded price adjustment inside M3d market clearing, then M3e settles at
the resulting transaction quantities and prices.

D-043 formally approves the implemented ordering. The key semantic reason is that
prices are determined by physical market imbalance, not by financial settlement.
Moving the bounded update after settlement would not change current-day pending
prices in M3f, but would create an unnecessary future coupling between financial
flows and current prices. Future financial flows must not retroactively alter
established transaction prices. This is recorded as a design clarification, not a
prose-only change.

## Implemented versus provisional versus future

- **Implemented:** M0–M3f as listed in §17.1, including the integrated economic
  day, cash-safe household/production funding, M3d/M3e settlement, atomic staging,
  needs/militancy, and the provisional monthly wealth convention.
- **Provisional:** bounded price coefficients, M3 wage/upkeep rules, monthly wealth
  income window, and synthetic catalog/calibration values.
- **Future:** full wage-index/scarcity/productivity/inflation/law behavior, private
  profit distribution, state-enterprise remittance, taxes, government finance,
  debt/interest/maturity, inflation/FX, banking, multi-market trade, politics,
  technology, diplomacy, war, AI, and UI.

## Unresolved design choices

1. **Monthly income measurement window.** The current convention annualizes one
   day’s actual settled wage receipts. An exact trailing-month average requires a
   persistent per-block income accumulator and a schema/save-format change; neither
   is implemented or authorized by this revision.
2. **Full economic semantics.** Wage index, labor scarcity, productivity,
   inflation/law adjustments, owner distribution, state-enterprise remittance,
   land rents, losses, taxes, and credit remain future requirements.
3. **Catalog completion.** The eight-good/eight-building M3 subset is not the
   fifteen-good/thirteen-building v1 target.
4. **Mobile performance.** The GDD mobile p95 target remains **NOT EVALUATED**;
   Node benchmarks are diagnostic only.

## Validation

- `Century_GDD_v2.2.md` created; v2.1 retained for history.
- README authoritative GDD link updated to v2.2.
- D-043 records the daily price/settlement resolution; D-032 notes v2.2
  supersession.
- Version/status references and internal section references reviewed.
- No simulation code, schema, data version, save format, or tests changed.
- `git diff --check` clean.

## Stop condition

Documentation only. M3f remains committed at `53610b8`. No M4 or later milestone
work was started. The revision is left uncommitted for review.
