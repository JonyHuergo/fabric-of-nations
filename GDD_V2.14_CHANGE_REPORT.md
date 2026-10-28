# GDD v2.14 change report — E5 Labor and Social Institutions

This report records the E5 implementation delivered against
`Century_GDD_v2.14.md` (authoritative), `DECISIONS.md` D-078, and the E5 scope in
§17A.9, §17A.13.2, §17A.14, and §17.5. It is the E5 code/data/tests/documentation
change; it does not start E6 or M10.

## 1. Scope delivered

- **Vocational training and qualifications.** A funded training service with real
  academic instructors, a player-set academic staff share, capped part-time trainee
  participation, treasury-limited provider payroll, and a separate per-trainee
  stipend. A new authoritative `PopBlock.qualification` is built only by funded
  training and drives actual wage and labour-productivity factors. Training is
  part-time and in-service, so it does not double-assign people; its time cost is
  modelled explicitly.
- **Public health.** A player-set share of the existing administration clerk base
  delivers public-health service. Health staffing coverage, administration funding
  adequacy, and literacy determine service output; a derived mortality factor is
  applied in demography together with technology and labour-hours factors. The
  administrative-capacity cost is real, and a health law can impose a minimum share.
  Practitioner-level medical staffing is a documented simplification.
- **Labor and health laws.** The M8 labor slot gains a minimum-wage law and a
  working-hours/standards law; the health slot gains a public-health law. The minimum
  wage changes actual wage obligations through the existing `wages` posting; the
  hours standard scales capacity and wages and applies a bounded mortality
  improvement; the health law enforces a minimum staff share on the player action.
- **Immediate vs slow channels.** The training stipend changes household cash on the
  day it is paid. Qualification gains, wage/productivity effects, and public-health
  mortality effects are slow and accumulate through state/population stocks.
- **Migration policy integration.** The M8 trade law remains the legal path for
  cross-country migration access (`Country.immigrationOpen`); E5 adds tests and does
  not duplicate the border action. M5 migration conservation is unchanged.
- **Accounting.** `training-payroll` and `training-stipend` are balanced cash-neutral
  postings over `training-expense`/`training-income`. Treasury cash limits both; the
  unpaid request is an explicit month-to-date shortfall, never debt. Fiscal totals
  add `trainingExpenseSUSD`; budget totals add requested/shortfall fields (sparse in
  the canonical save).
- **Worker/UI.** Protocol 10 exposes four validated actions. Country snapshots expose
  an immutable labor section (training participation/instructors/trainees/quality
  inputs, qualification average, health staffing/service/mortality, statutory
  wage/hours, blocked reasons). A Labor tab separates observed state from estimates
  and offers the four controls. Labor/health laws are proposed in the Politics tab.
- **Persistence.** World schema **23**, simulation **0.23.0**, save format **1**,
  data version **`m3-economy-v8`**, worker protocol **10**. Older saves and protocol-9
  clients are rejected; no migration is implemented (D-013).

Explicitly deferred: pensions/social insurance, collective bargaining, labour-market
information/enforcement, unemployment insurance, cross-profession promotion,
practitioner-level medical staffing, E6 trade/monetary mechanics, and M10.

## 2. M9 closure review

The repository was verified at `a81f9507c591112eea60ef10e757622db4196761`
with a clean working tree, matching the reported M9 final HEAD. The M9 technology,
research, education, age-specific literacy, protocol, and persistence interfaces are
present and usable by E5. The only extensions needed were the third claim on academic
staff time (training instructors) and the health share within the existing
administration clerk base; both default to zero and preserve M8/M9 behaviour.
**No mandatory M9 acceptance failure was found; no M9 remediation was required.**

## 3. Verification

The E5 work was verified with the non-benchmark commands below. No benchmark,
performance measurement, full campaign, stress/soak run, or `pnpm run ci` was
executed under the standing no-benchmark restriction. A benchmark entry
(`packages/bench/src/e5Bench.ts`, registered in `bench.ts`) was added but **not run**;
no benchmark threshold or report was modified.

| Command | Result |
|---|---|
| `pnpm run typecheck` | Pass: all six workspace packages |
| `pnpm run lint` | Pass: 176 TypeScript files checked, 57 in `packages/sim` |
| `pnpm test` | Pass: **67 suites / 708 tests** |
| `pnpm run check:worker` | Pass: generated scenario and app worker bundle current |
| `git diff --check` | Clean (exit 0; line-ending warnings only) |

Focused E5 tests cover: neutral policy inertness; funded training derivation;
zero-budget blocking; stipend/payroll accounting and slow qualification growth;
treasury-limited training and explicit shortfall; qualification wage premium;
minimum-wage law effect; working-hours effect; public-health mortality/admin cost;
health-law floor; save/load/replay; worker snapshot/action validation.

## 4. Material decisions and limitations

The full decision record is D-078. Important limits:

- Qualification has no source-backed historical series, initialises to zero, and has
  no decay (retention is persistence). Training/health coefficients, minimum wage,
  hours, and trainee/instructor ratios are provisional.
- Minimum wage has no hiring/employment elasticity in E5; wages, employer cost, and
  household income are real, but job quantities are not wage-responsive.
- Public health is delivered by clerks; hospitals, practitioners, and health capital
  are not modelled.
- No cross-profession promotion; literacy/wealth still gate profession entry.
- The historical scenario starts with neutral E5 policy (zero budgets/shares), so the
  historical trajectory is not silently rewritten; the player enables the services.

## 5. Files changed

Implementation: `packages/sim/src/economy/labor.ts` (new), `types.ts`,
`constants.ts`, `accounts.ts`, `accounting.ts`, `validation.ts`, `state.ts`,
`settlement.ts`, `production.ts`, `politics.ts`, `technology.ts`, `ai.ts`, `day.ts`,
`budget.ts`, `period.ts`, `country.ts`, `index.ts`; `packages/sim/src/serialization.ts`;
`packages/sim/src/population/types.ts`, `state.ts`; `packages/sim/src/economy/migration.ts`;
`packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `actionHistory.ts`,
`laborPreview.ts` (new), `index.ts`; `packages/app/src/screens/LaborScreen.tsx` (new),
`App.tsx`, `src/worker/SimulationProvider.tsx`; generated worker scenario/app bundle.
Data: `packages/data/data/politics.json`, `technology.json`, scenarios, `src/version.ts`.
Tests: `packages/tests/src/e5-labor.test.ts`, `e5-worker.test.ts`,
`fixtures/e5.ts`, plus golden-hash/version updates and the M7 snapshot fixture.
Docs: `Century_GDD_v2.14.md`, `DECISIONS.md` D-078,
`docs/E5_REQUIREMENTS_MAP.md`, this report, `README.md`; benchmark entry
`packages/bench/src/e5Bench.ts`.
