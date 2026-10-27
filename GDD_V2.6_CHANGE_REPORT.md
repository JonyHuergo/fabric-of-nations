# GDD v2.6 — Change Report

**Status:** documentation revision; Economic Management Overhaul E0 design and
planning adoption. No gameplay implementation.
**Authoritative document:** `Century_GDD_v2.6.md`
**Supersedes:** `Century_GDD_v2.5.md` (retained byte-for-byte as historical documentation)
**Revision date:** 2026-10-27
**Implementation baseline:** accepted/implemented M0–M7, with M7's native-release and
real-device acceptance exception. Current versions: world schema **16**, simulation
**0.16.0**, save format **1**, data version **`m3-economy-v3`**. E0 is documentation
only; E1–E6 are planned and not implemented.

## Purpose

This revision makes Century's intended economic gameplay explicit and durable. It
adds a dedicated Economic Management Overhaul specification: the player should be
able to understand a country's economy, choose meaningful policies, finance them,
invest in productive capacity, pursue distinct strategies, and see understandable
consequences. The revision records the complete long-term policy framework, the
economic interface and reporting requirements, eleven design principles, the E0–E6
roadmap, acceptance criteria, implementation-status labels, and dependency gates.

It does not implement E1 or any later stage, does not change simulation code,
scenario data, tests, save schemas, generated artifacts, or version constants, and
does not replace the existing GDD with a summary. The v2.5 document is preserved
unchanged for historical recovery.

## Summary of changes

| Area | Change |
|---|---|
| Header/authority | Version 2.6; new alignment note; E0/E1–E6 status; current versions preserved; v2.5 retained as historical. |
| Contents/§1.4 | Adds the Economic Management design objective and core diagnose–choose–finance–observe loop, with a prominent cross-reference to §17A. |
| §8 cross-reference | Points public finance to the long-term fiscal framework in §17A.5 while keeping §8 authoritative for implemented rules; lists implemented vs. unimplemented fiscal systems. |
| §13 cross-reference | Points presentation to §17A.12; M7 six screens remain the current baseline, not the target information architecture. |
| §17 status/table | Adds E0 (documented, no code) and E1–E6 (planned) to the scope/status table and milestone table; adds the combined economic-management sequence; preserves M0–M10 identities and M7/M7a/M8a status. |
| §17.3/§17.4 | Records the E-program insertion, the M8a retention as E6b, M7a's independent placement, and the combined order without renumbering accepted milestones. |
| §17.5 (new) | Economic Management roadmap summary: purpose, dependencies, deliverables, exclusions, authority/status rules, and relationship to M8/M9/M10/native/calibration tracks. |
| §17A (new) | Detailed E0 specification: product goal/loop; implementation-truth labels and authority; eleven principles; seven policy areas; economic interface; acceptance criteria; E0–E6 stage specs; cross-cutting requirements; open-question/dependency register. |
| §17A.5 | Fiscal framework: personal/business/consumption/excise/property/land/customs taxes; welfare; administration; education/health; infrastructure; subsidies; procurement; reserves; borrowing/repayment/refinancing. Each instrument records base, calculation, posting path, agents, timing, consequences, status, dependencies. |
| §17A.6 | Construction/public investment: project queue, project classes, money/labor/materials/time, financing/ownership, progress, completion into real assets, cancellation/interruption/failure, accounting/atomicity/determinism. |
| §17A.7 | Industrial/business policy: sector subsidies, investment incentives, public-enterprise creation/expansion/operation, procurement, development programs, exceptional price/production controls; ownership/accounting constraints. |
| §17A.8 | Trade: explicit statement that shared markets are not international trade; trade/customs/transport/currency prerequisites; tariffs/quotas/agreements/export incentives/protection; no tariff before real trade mechanics. |
| §17A.9 | Labor/social: welfare, minimum wage, hours/standards, collective bargaining, education/training, health, pensions/social insurance, migration; channels and time lags; M8/M9 prerequisites. |
| §17A.10 | Monetary: SUSD convention; money/credit, banks/central bank, interest rates, convertibility, FX, inflation foundations; country-appropriate powers; M8a retained as E6b. |
| §17A.11 | Regulation/structural reform: competition, price controls/rationing, land reform, privatization/nationalization, investment rules, institutions; trade-offs and dependencies; not part of committed E0–E6 sequence. |
| §17A.12 | Interface/reporting: five player questions; national dashboard; definitions/units/periods; stocks/flows, nominal/real, reported/forecast; no undefined GDP; evidence-based causes; pre-commitment explanations; bounded monthly report/action history; screen evolution. |
| §17A.13 | Overall, per-stage, and task-based acceptance criteria; strategy examples; explicit non-acceptance criteria. |
| §17A.14 | Detailed E0–E6 stage scope, deliverables, dependencies, exclusions, and acceptance. |
| §17A.15 | Cross-cutting state/persistence, atomic actions, determinism, accounting, player/AI, snapshot/report, bounded state, performance, testing, and data-placement requirements. |
| §17A.16 | Open design questions and dependency register (construction accounting/materials, land, trade counterparty, banking, inflation, health/pensions/bargaining, sector classification, actions, GDP, report retention, schema migration). |
| §19 | Clarifies that E1–E6 are not part of the current v1/M0–M7 delivery unless separately assigned. |
| §20.1/§20.2/§20.3 | Adds the E-program decision/status (D-070), records the economic open choices, and updates handoff status (E0 complete; E1–E6 not implemented). |
| §21 Glossary | Adds economic-management, E stage, taxable base, project/queue, policy action, monthly report, public enterprise, tariff/customs, monetary authority, real/nominal terms. |
| README | Makes GDD v2.6 the design authority, retains v2.5/v2.4/v2.3 as historical, marks E0 design-only, updates the roadmap/order/status table, and adds the E-stage summary. |
| DECISIONS | Adds D-070 recording the E0–E6 adoption, combined order, M8a retention as E6b, boundaries, open choices, and documentation-only status. |

## E0–E6 roadmap and relationship to M8+

**E0 (this revision):** economic-management design specification. Complete as
documentation; no code.

**E1:** economic clarity/dashboard, supported causal explanations, pre-commitment
explanations, bounded monthly report/action history, focused M7 screen improvements.
No major new mechanics.

**E2:** fiscal management: supported tax/spending instruments, budget allocation,
reserves, borrowing/repayment/refinancing controls, financing constraints. New bases
only where mechanics exist; customs waits for E6a, land/property for a land model,
education/health delivery for E5, and business tax for a stable profit measure.

**E3:** public investment/construction: project queue, real money/labor/material/time,
financing, progress, completion into actual assets, cancellation/failure, save/replay.

**E4:** industrial/business policy: coherent subset of sector subsidies, procurement,
investment incentives, public-enterprise investment; every lever changes actual
enterprise/budget/production/investment behavior.

**E5:** labor/social institutions: E5a services/transfers/training/migration and
E5b legal labor standards; requires M8 laws/institutions and M9 education/literacy/
human-capital mechanics. Unsupported pensions/bargaining/health remain deferred.

**E6:** trade and monetary economy, split deliberately:
- **E6a** real inter-market trade/transport/trade costs/customs/currency transactions
  and then commercial policy. No tariff on shared-market clearing.
- **E6b** retained **M8a** scope: inflation measure, FX dynamics, monetary
  authority/instruments, money/credit accounting, with banking/institutional
  prerequisites recorded.

**Combined planning order:**

```
M7 → E0 → E1 → M7a (recommended before E2) → E2 → E3 → E4
   → M8 → M9 → E5 → E6 → M10
```

**Relationship to existing milestones:**

- M0–M10 identities are unchanged; no accepted milestone is renumbered or reopened.
- M0–M7 remains the playable vertical slice. E1–E6 and M7a/M8a are post-slice and are
  not prerequisites for the initial playable release.
- M8 (political institutions/laws) and M9 (technology/education) precede E5 because
  legal labor institutions and human-capital/service effects need those mechanics.
- M8a is not deleted, renumbered, or reduced; its scope is retained as E6b, scheduled
  after the political, human-capital, and trade prerequisites.
- M7a remains an independent planned annual-accounting stage; recommended before E2
  if annual fiscal reporting is included, but not a gate for E1 or E3–E6.
- M10 remains last.
- Native release certification, mobile performance, historical calibration, and
  accounting-stability engineering remain separate acceptance tracks; E stages do not
  close the M7 device exception.

The prior finance/engineering sequence (`M4c → … → M7 → M7a → M8 → M8a → M9 → M10`)
remains the record for those stages. Where the sequences differ, §17.4/§17.5 and
D-070 state the combined order and rationale; two contradictory authoritative orders
are not left in place.

## Policy framework coverage

The new §17A.5–§17A.11 document all seven requested areas:

1. **Fiscal policy/public finances** — personal, business, consumption/excise,
   property, land, customs; welfare; administration; education/health; infrastructure;
   subsidies; procurement; reserves; borrowing/repayment/refinancing. Implemented
   subset is explicitly the flat wage income tax, single welfare transfer, state-
   enterprise remittance, and M5b debt; all other instruments are not implemented and
   carry dependencies.
2. **Public investment/construction** — project queue, real costs/materials/labor/
   time, financing/ownership, progress/completion, cancellation/failure, actual assets;
   infrastructure requires transport/trade mechanics.
3. **Industrial/business policy** — subsidies, incentives, public-enterprise creation/
   expansion/operation, procurement, development programs, exceptional price controls;
   real behavior/accounting changes, not sector scores.
4. **Trade/commercial policy** — tariffs, restrictions, agreements, export incentives,
   protection, imported inputs/consumer goods, FX implications; all blocked on real
   trade/customs/transport/currency mechanics.
5. **Labor/social policy** — welfare, minimum wage, hours/standards, bargaining,
   education/training, health, pensions/social insurance, migration; explicit channels
   and time lags; M8/M9 prerequisites.
6. **Monetary policy/currency** — regimes, rates, central-bank lending, bank credit,
   convertibility, exchange-rate policy, inflation; SUSD convention; institutional/
   accounting foundations; country-appropriate powers; not a set of arbitrary sliders.
7. **Regulation/structural reform** — competition, price controls/rationing, land
   reform, privatization/nationalization, investment restrictions/incentives,
   institutions; trade-offs and prerequisites; not part of committed E0–E6.

Every instrument records its real base/path, calculation, posting/agents, timing,
player-visible consequence, and an explicit implementation status. Missing mechanisms
are listed as dependencies, not silently omitted.

## Economic interface and acceptance criteria

§17A.12 specifies the five player questions, national dashboard, definitions/units/
periods, stock-vs-flow, nominal-vs-real, reported-vs-forecast, evidence-based causal
explanations, decision pre-commitment explanations, and the bounded monthly report/
action history. It explicitly avoids undefined GDP/headline measures and false causal
precision.

§17A.13 defines overall acceptance (seven player questions), meaningful strategy
examples (industrial, agricultural/food security, export-led after E6a, welfare), and
concrete usability tasks. Per-stage acceptance is testable and tied to actual
mechanics/accounting/determinism/save behavior; E1 explicitly excludes major new
mechanics.

## Implementation truth and compatibility

- E0 is documentation only. E1–E6 are not implemented or claimed.
- M0–M7 remain the accepted/implemented baseline; M7 retains the native/device
  acceptance exception. M7a/M8a remain planned.
- Current versions are unchanged: schema **16**, simulation **0.16.0**, save format
  **1**, data version **`m3-economy-v3`**.
- No simulation source, test, scenario data, save schema, generated artifact, app
  behavior, or version constant was changed by this revision.
- The existing implemented systems (fiscal tax/welfare, enterprise finance/debt,
  markets, labor, UI/snapshot architecture) remain authoritative under their existing
  sections/decisions. The overhaul does not retroactively make proposed features real.

## Open questions and limitations

- §17A.16 records the material unresolved choices: construction capitalization and
  material requirements; land/property; trade counterparty/rest-of-world; banking/
  credit/monetary institutions; inflation measure; health/pensions/collective
  bargaining; sector classification; player/AI economic action expansion; GDP/headline
  definitions; report retention; schema/save migration. They are not accepted by E0.
- `CEN-AUDIT-016` sovereignty remains unresolved; no political model was invented.
- The design is ambitious; E1–E6 are explicitly phased and may be narrowed/split by
  later decisions, but no stage may become a decorative control.
- Native device/mobile performance and historical calibration remain unverified and
  are not addressed by this design revision.

## Documentation verification

This task was documentation-only. Checks performed:

- Verified branch/HEAD/working-tree and recent history before editing.
- Read `AGENTS.md`, GDD v2.5, `DECISIONS.md`, `README.md`, the roadmap, and recent
  remediation reports.
- Reviewed the final GDD for section numbering, duplicate/missing headings, preserved
  M0–M7/M7a/M8a/M8–M10 records, implementation-truth labels, and contradictions.
- Cross-checked the E-program sequence against §17.3/§17.4/§17.5 and D-070.
- Ran `git diff --check` on the documentation diff.

No simulation, tests, benchmarks, stress/soak tests, app exports, native builds,
dependency installation, or profiling were run, as required for this documentation
task.

## Files changed

- `Century_GDD_v2.6.md` (new authoritative GDD; v2.5 retained byte-for-byte)
- `GDD_V2.6_CHANGE_REPORT.md` (this report)
- `README.md` (version authority, roadmap, E0 status)
- `DECISIONS.md` (D-070)

No implementation files, data files, generated bundles, or version constants were
changed.

## Commits

Implementation/documentation commit and final HEAD are reported in the handoff.
The commit contains only documentation changes; no gameplay code or scenario data is
included.
