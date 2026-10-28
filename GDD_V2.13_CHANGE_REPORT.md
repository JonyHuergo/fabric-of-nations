# GDD v2.13 change report — M9 Technology and Education

This report records the M9 implementation delivered against
`Century_GDD_v2.13.md` (authoritative), `DECISIONS.md` D-077, and the §17 M9
definition of done. It is a documentation change plus the M9 code/data/tests
commit(s); it does not start E5, E6, or M10.

## 1. Scope delivered

M9 implements §10.1–§10.3 and the §17 M9 row:

- **Technology graph.** `technology.json` holds 120 technologies across six eras
  with stable ids/keys, era, prerequisites, research work, and typed effects.
  Load-time validation rejects duplicate or non-positional ids, duplicate keys,
  unknown/self/repeated/cyclic prerequisites, later-era prerequisites, invalid
  work, and invalid effects.
- **Research work.** Per-country research state (researched list, one active
  project, project-specific accumulated work). Daily work comes only from
  available academic staff assigned to research, scaled by academic literacy,
  education quality, and funding adequacy. Zero staff/share/funding yields zero
  work. Cancelling retains the project's work; it never transfers to another
  technology. Completion is recorded on the effective day and applies from the
  next civil day.
- **Technology effects.** Sector output productivity, mortality reduction,
  education effectiveness, building unlock (`BuildingDef.requiredTechnologyId`),
  and law enable (`LawDef.requiredTechnologyIds`). Each effect is read from the
  researched set by the affected system; none is a display-only score.
- **Education.** A cash-limited education/research payroll over actual academic
  households; teaching capacity from the teacher share of academics; attendance
  constrained by capacity, household wealth, and the enacted education law;
  education quality from coverage, academic literacy, law, and technology;
  authoritative age-specific literacy (`PopBlock.literacyByAge`) updated for the
  school-age cohort and shifted by ageing and migration.
- **Education law.** The M8 education slot now has `education-none`,
  `education-voluntary`, `education-compulsory-primary`, and
  `education-universal` options; compulsory/universal require researched
  technologies. Enactment uses the existing proposal/support/regime/prerequisite/
  effective-day pathway.
- **Player workflow.** New Technology tab: catalog by era, prerequisites, effects,
  unlocks, research status/progress, education staffing/capacity/attendance/
  funding/quality, blocked reasons, and validated actions. Previews are computed
  from the immutable snapshot; the simulation remains authoritative.
- **Accounting.** Education payroll is a cash-neutral transfer
  (`education-payroll`): country `education-expense` / treasury, academic household
  cash / `education-income`. Treasury cash limits payment; the unpaid request is an
  explicit month-to-date shortfall. Fiscal totals add `educationExpenseSUSD` and
  `netFiscalResultSUSD` subtracts it; budget totals add requested/shortfall fields.
- **Persistence/protocol.** World schema **22**, simulation **0.22.0**, save format
  **1**, data version **`m3-economy-v7`**, worker protocol **9**. Older saves and
  protocol-8 clients are rejected; no migration is implemented (D-013).

Explicitly not implemented: E5 health/training/social services, qualification
promotion, minimum wages/hours/bargaining/social insurance; E6 trade and monetary
mechanics; M10 military technology, diplomacy, and war.

## 2. M8 closure review

The repository was verified at
`ea89a7ce41c4ccae1e5f9e40dd5fb52a03482e56` with a clean working tree. The §17C/D-076
M8 record matches the GDD's M8 acceptance criteria. The documented M8 deferrals
(education/health/currency/colonial/military-service law mechanics; tariffs/customs;
labor standards/social insurance; AI law proposals; crisis-response actions; riots)
are assigned to later stages and are not mandatory M8 criteria. No concrete M8
acceptance failure was found; no M8 remediation was required. M9 adds the education
law options that M8 explicitly deferred.

## 3. Data and generated artifacts

- Added `packages/data/data/technology.json` (120 technologies, six eras, academic
  profession keys).
- Added academics to `historical_professions.json` and one academics block per
  historical region in `pops_1900.json`, splitting 8% of each clerks block so country
  population totals and calibration targets are unchanged (64 → 80 blocks).
- Added the academics fertility multiplier to `demography.json`; academics
  interest-group weights and four education laws to `politics.json`; regime education
  defaults; initial researched technologies and education funding/share to
  `countries_1900.json`; two technology-gated building definitions to
  `historical_buildings.json`.
- Bumped every authored scenario metadata `dataVersion` to `m3-economy-v7`.
- Regenerated `packages/sim-worker/src/generated/m5Scenario.ts` and
  `packages/app/src/generated/simWorker.ts`.

## 4. Material design decisions (D-077)

See D-077 for the full record. Key choices: one active project per country; work
retained per technology and never transferred; academic profession as the real staff
base (mirroring M8's administration simplification); funding adequacy multiplicative
on service/work; age-specific literacy authoritative with the scalar as the derived
15+ aggregate; education law through the M8 pathway; sparse fiscal-total encoding to
keep the canonical save under 4 MiB.

## 5. Tests and verification

Correctness-only; **no benchmark, profiling, performance measurement, stress/soak,
full-campaign, or benchmark-invoking CI command was run**, and no existing benchmark
threshold or report was modified. A new M9 benchmark entry
(`packages/bench/src/m9Bench.ts` and its registration) was added and typechecked but
deliberately not executed.

Commands and results are recorded in §6 of this report after the final run.

## 6. Exact non-benchmark verification

All commands were run from the repository root on 2026-10-28.

| Command | Result |
|---|---|
| `pnpm run typecheck` | PASS — `@century/sim`, `@century/data`, `@century/sim-worker`, `@century/app`, `@century/tests`, `@century/bench` all completed with no errors |
| `pnpm run lint` | PASS — `Boundary checks passed (170 TypeScript files, 56 in packages/sim)` |
| `pnpm test` | PASS — **65 suites / 694 tests**, 0 failures, 0 snapshots, 1,264.3 s |
| `pnpm run check:worker` | PASS — data build, `worker scenario is current`, `worker bundle is current` |
| `git diff --check` | PASS — exit 0 (only Git's LF→CRLF informational warnings) |

Focused M9 suites: `m9-technology.test.ts`, `m9-education.test.ts`, and
`m9-worker.test.ts` (31 tests) pass. They cover definitions validation, valid and
invalid actions, research progress/completion, cancellation/retention, productivity,
mortality, building/law unlocks, payroll accounting and cash conservation, shortfall
and no-debt behaviour, memo reset, age-specific literacy, funding/staffing blocks,
ageing and migration integration, education-law effective-day timing, worker
protocol/snapshot wiring, determinism, save/load, old-version rejection, and
bounded state.

No benchmark, profiling run, performance measurement, stress/soak test,
full-campaign run, or benchmark-invoking CI aggregate (`pnpm run ci`) was executed.
The new M9 benchmark entry was only built/typechecked.

## 7. Remaining limitations

- Urbanization is not separately modelled (no urban/rural population split).
- No research material goods/operational input recipe; research is labour plus
  funding only.
- No separate government school/research buildings; academic staffing is a
  documented service-institution simplification.
- No E5 qualification promotion, training, health, or social services.
- No AI research/education policy; AI-sourced actions are rejected.
- Technology content, work requirements, education coefficients, and initial
  research/funding values are provisional, not historical calibration.
- Military technology effects and M10 capabilities are not implemented.
- M7's native/device verification exception remains in force.
