# GDD v2.19 change report

**Baseline:** `109ac06` (GDD v2.18 with the M13–M16 records).

**Result:** GDD **v2.19** adopts the **Prosperity Program** (P0, design only). No
simulation, data, schema, protocol or app behaviour changed in this revision.

## 1. What v2.19 records

- **§17J (new).** Binding summary of the peacetime economy and demography overhaul:
  objective, eight foundational rules, stages P0–P15 with principal acceptance
  criteria, the rollback mechanism, the companies/capital-markets staging and the
  performance reporting rule with the 2026-11-02 baseline.
- **Decisions D-115 to D-124** in `DECISIONS.md`: program adoption, rollback,
  population granularity, provinces replacing regions, customs territories, save
  break, data sources, RUSD definition and local-currency display, companies and
  capital markets, cause-driven demography.
- **Superseded-direction markers** placed at §4.2 (whole-day atomicity), §6.6
  (demography), §7.4 (markets), §17A.10.1 (RUSD convention) and §20.1 #1, #4, #14,
  #19. Each marker states that the existing text remains the current implementation
  until its stage is accepted.
- **Contents** lists §17J.

## 2. Conflicts identified and how they are resolved

| Existing rule | New decision | Resolution |
|---|---|---|
| §20.1 #14, §4.2 whole-day staged clone; D-067 | D-116 | Replaced by phase preconditions plus checkpoint rollback with deterministic replay; no partial day accepted |
| §20.1 #1 region × occupation blocks | D-117 | Sparse province × profession blocks with unchanged age state |
| D-103 `SimulationRegion` kept as accounting unit; D-087 territories as regions | D-118 | Region layer removed; territories are provinces of their sovereign |
| D-051 shared markets; D-091 authored trade zones; D-079 single administration per zone | D-119 | Customs territories, national by default, historical unions explicit |
| D-110 §1, `AGENTS.md` §1, §17A.10.1 RUSD wording; D-080 "rates unavailable by design" | D-122 | RUSD defined as 1990 reference dollars; initial rates from cited 1900 parities, not invented |
| D-026/D-027 and §6.6 WPP schedules as levels | D-124 | WPP supplies age pattern only; levels are caused; series are validation targets |

## 3. Supporting documents

- `docs/PROSPERITY_PROGRAM.md` — diagnosis, target design, stage specifications,
  dependencies, rollback guarantee, benchmarks, risks.
- `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md` — feasibility, entities,
  integration, stages P9–P13, historical accuracy, performance, open questions.
- `AGENTS.md` §1 RUSD definition updated to D-122.

## 4. P1 addendum (same revision)

P1 implemented D-116 for the worker host, the bit-identical hot-path fixes, and the
approved D-125 (aggregated market postings, one cash-capped market attempt), with D-126
(minimal employment repair) and D-127 (exact work-in-progress capitalization). The §4.2
markers (steps 5 and 7, whole-day atomicity) and §17J status record it. Details:
`P1_COMPLETION_REPORT.md`.

## 5. Versions

World schema, save format, data version and worker protocol are unchanged; saves
remain loadable because the state shape is unchanged. D-125/D-126/D-127 change
simulated trajectories, so a game continued from a save diverges from its pre-P1 future.
The simulation version string was not bumped; the designer may want it bumped to mark
the behaviour change. P1 adds API surface
(`TickContext.integrity`, `tickPhaseMode`, `runTicksWithRollback`,
`createRollbackRunner`, `checkpointRollbackRunner`, `assertDailyWorldInvariants`,
`worldDayFingerprint`, `buildBuildingCapacityIndex`).
