# Century — GDD v2.12 Change Report (M8)

- **GDD:** `Century_GDD_v2.12.md` (authoritative); v2.11 retained byte-for-byte.
- **Revision date:** 2026-10-27
- **Baseline:** E4 documentation HEAD `7a018daf7d06c24cdb68cbeaac4d160f3c4e06fe`
- **Scope:** M8 — Laws and Institutions only. E5, E6/M8a, M9, and M10 are not
  implemented.
- **Projection:** no benchmarks, performance measurements, campaigns, profiling,
  stress/soak runs, or device tests were run, per the active no-benchmark
  restriction.

## 1. E4 acceptance review

E4's authoritative criteria are §17A.13.2 E4, §17A.7, and §17A.14 E4: at least one
coherent industrial instrument must change actual enterprise/budget/production/
investment behavior and be testable; unsupported instruments must be labelled
dependencies; no sector score or decorative modifier.

The repository at the reported HEAD implements a sectoral production subsidy on
verified physical output with a treasury-cash limit and explicit shortfall, actual
construction material procurement and capitalization, and balanced public-enterprise
capital support. `packages/tests/src/e4-industrial-policy.test.ts` covers bases,
payment/shortfall, material purchase and shortage/resume, support accounting, action
rejection, snapshots/previews, save/replay, and monthly/annual reconciliation.

Private co-financing, loans and guarantees, investment tax credits,
general/delayed procurement, and public-enterprise expansion/discontinuation are
listed as dependencies in §17A.7.2/§17A.7.3, §17A.14 E4, and §17A.20. The GDD
requires unsupported instruments to be labelled until their predecessor mechanisms
exist, so these are permissible deferrals, not unmet mandatory criteria. **No E4
remediation was required or performed.**

## 2. Authoritative M8 scope

M8 implements §9.1–§9.5 and the §17 M8 definition of done:

1. seven interest groups derived from pop blocks, with organisation, normalised
   influence, and per-law stances (no spendable political pool);
2. law definitions with prerequisites, eligible regimes, enactment duration, and
   effects on concrete systems for taxation, suffrage, labor, and trade;
3. a `propose-law` workflow that enacts, changes, or repeals a law through
   support, legal path, and time, with a persisted effective day;
4. elections derived from the suffrage franchise and enfranchised population, with
   a documented bloc-vote rule and government-composition consequences;
5. regional unrest and country crisis pressure from measured conditions, with
   deterministic unrest → strike → crisis → revolution transitions;
6. institutions with clerk staffing, cash-limited administration payroll,
   derived quality/overload, and effects on tax collection, construction,
   enactment, and unrest;
7. a bounded scripted-event queue with idempotent application and provenance;
8. complete worker/snapshot/Politics-tab integration; and
9. save/load, determinism, bounded state, and version changes.

Education, health, military service, colonial policy, and currency have no
proposable law options; they are labelled later-stage dependencies. Trade law
governs border access only; tariffs/customs are E6a. Labor law governs organisation
and grievance only; wages/hours/bargaining are E5.

## 3. Law model and legal path

- `Country.laws` covers all nine slots; 0 means no implemented law.
- `LawDef` data provides stable ids, slot, name/description, prerequisites, eligible
  regimes, base enactment days, tax-rate bounds, suffrage rule, border policy, labor
  organisation/grievance, institution load, and seven group stances.
- Support = `Σ(influence × stance) / Σ influence`; the threshold is 5%. Influence is
  derived and never spent.
- Validation rejects unknown/unimplemented options, already-enacted targets,
  duplicate slot transitions, the four-transition cap, ineligible regimes, unmet
  prerequisites, insufficient support, wrong day, wrong player country, and all
  AI-sourced M8 actions.
- Enactment duration is computed at proposal as
  `ceil(baseDays / (0.5 + 0.5 × quality))`, bounded to `baseDays..2×baseDays`.
- A transition applies at the start of its effective day. It never rewrites a closed
  month, annual summary, or report. Statutory tax bounds clamp the current rate
  forward on the effective day and log the compliance.

## 4. Regimes and elections

- Regimes: `absolute-monarchy`, `constitutional-monarchy`, `republic`.
- Suffrage: none, property (block wealth ≥ authoritative threshold), adult male
  (21+), universal (21+).
- An election runs only with an elected regime, positive franchise/population, due
  day, and institution quality ≥ 0.25. A skip is logged and rescheduled; a timer
  alone never fabricates votes.
- Votes are bloc votes from the enfranchised population; group government support is
  `0.5 + 0.5 × average stance on enacted laws`. Government wins at ≥ 0.5; otherwise
  the largest opposition-weighted group governs. Ties use fixed group-key order.
- Only the last election result is retained.

## 5. Interest groups, unrest, crisis, and revolution

- Seven fixed groups: aristocrats, capitalists, labor, intelligentsia, military,
  bureaucrats, rural. Membership uses authored profession shares and sums to the
  owned population; unknown profession keys are assigned to labor, not dropped.
- Organisation/influence derive from membership, literacy, wealth, organisation
  base, labor law, franchise, and institutional access. Influence is normalised.
- `Region.unrest` updates daily after needs/militancy from militancy, unmet
  subsistence, unemployment, administration overload, labor grievance, and
  institution relief. The tax/construction effects are read next day.
- Crisis pressure weights population-weighted militancy, regional unrest, unmet
  subsistence share, political exclusion, institution overload, and labor
  grievance. Pressure days accumulate above 0.55 and decay by 2 below it. Stages
  require 30/90/180/360 days.
- Strike/crisis/revolution reduce throughput in regions with unrest ≥ 0.6.
- Revolution changes a monarchy to a republic, changes the governing group, resets
  laws to republican defaults, cancels transitions, applies a one-year disruption,
  and records a bounded entry. No money, debt, population, building, or accounting
  period is changed. A five-year cooldown prevents loops.

## 6. Institutions and administration

- One administration per country, staffed by authored administration professions
  (`clerks`). The model deliberately does not create government buildings or
  duplicate people.
- `set-institution-funding` sets an annual target. The fiscal phase pays
  `target / daysInYear` after tax and welfare, limited by treasury cash above the
  reserve floor, to administration households proportionally.
- Posting: country `administration-expense` debit / treasury credit; household cash
  debit / `administration-income` credit (`administration-payroll`); cash-neutral.
- Quality = weighted staffing, funding adequacy, literacy, regional infrastructure,
  law factor, minus active disruption. Overload = staffing shortfall + funding
  shortfall + law load.
- Tax collection efficiency = `clamp(0.6 + 0.4×quality − 0.2×min(overload,1), 0.4, 1)`.
- Construction crew cap is multiplied by
  `clamp(1 − 0.3×min(overload,1) − 0.2×(1−quality), 0.4, 1)`.
- Enactment uses the quality term; unrest uses quality relief and overload pressure.

## 7. Accounting and reporting

| Flow | Posting | Cash |
|---|---|---|
| Administration payroll | Country administration expense debit / treasury credit; household cash debit / administration income credit | Cash-neutral |
| Income tax | Existing income-tax postings, amount multiplied by collection efficiency | Treasury receives actual withheld cash |
| Construction | Existing wage/material capitalization; lower crew cap | None additional |
| Revolution/crisis | No monetary posting | None |

Fiscal totals add optional `administrationExpenseSUSD`; budget totals add
`administrationRequestedSUSD`/`administrationShortfallSUSD`; net = income tax +
business tax − welfare − interest − subsidy − administration. The period/annual
validators and annual aggregation now subtract subsidy and administration expense.
Designated cash, accounting identity, owner equity, and monthly/annual reconciliation
are tested.

## 8. Ordering, atomicity, and determinism

Daily order: politics start (events, effective laws, first-of-month institution/
group/election/crisis) → country AI → demography/employment/migration → market/
settlement → fiscal (collection efficiency + welfare + administration payroll) →
industrial subsidy → business tax → construction (quality-adjusted crew) → debt →
needs/militancy → regional unrest → wealth → close → M5a distribution.

The whole day is staged on a structural clone and published only after validation.
Countries, groups, laws, regions, events, and log entries are processed in ascending
stable order. M8 uses no `Date`, `Math.random`, wall time, or shared PRNG.

## 9. Schema, protocol, data, and save consequences

- World schema **21**, simulation **0.21.0**, save format **1**, worker protocol
  **8**, data version **`m3-economy-v6`**.
- New country state: regime, laws, law transitions, interest groups, institutions.
- New region state: unrest, infrastructure.
- New world state: politics enabled flag, bounded event queue/log, allocators.
- New accounts: country `administration-expense`, popBlock `administration-income`.
- New cash-neutral posting kind: `administration-payroll`.
- New protocol actions: `propose-law`, `set-institution-funding`.
- New snapshot sections: country politics (regime/elections/crisis/franchise/
  support/groups/institution/law slots/options/transitions/deferred slots/log),
  region unrest/infrastructure; optional administration budget/fiscal fields.
- Data v6 adds `politics.json`, scenario politics inputs, and regional
  infrastructure values; generated worker scenario and app worker bundle regenerated.
- Schema-20/older saves and protocol-7 clients are rejected explicitly; no migration
  is implemented under D-013. Bounded state: 4 transitions/country, one retained
  election, 7 groups, 9 law slots, 256 event queue, 64 log entries. Period/annual
  `countryBudgetTotals` use sparse encoding (zero fields omitted, missing decodes as
  zero), keeping the 1,200-month synthetic canonical save under 4 MiB after the
  administration fields were added.

## 10. Player workflow and UI

The Politics tab shows regime/government, election schedule/result, franchise and
support, interest groups, institution quality/overload/funding/shortfall, implemented
and deferred law slots with support/eligibility/prerequisites, in-flight transitions
and effective dates, regional unrest, crisis pressure/stage, and the bounded record.
The player can propose/change/repeal a law and set administration funding.
`previewLawProposal` and `previewInstitutionFunding` are pure snapshot previews; the
authoritative validation remains in the worker/simulation. Rejected actions leave
state unchanged.

## 11. Files created or modified

Core: `packages/sim/src/economy/politics.ts`, `politicsActions.ts`, `types.ts`,
`constants.ts`, `state.ts`, `country.ts`, `validation.ts`, `serialization.ts`,
`fiscal.ts`, `period.ts`, `budget.ts`, `accounts.ts`, `accounting.ts`, `ai.ts`,
`day.ts`, `production.ts`, `construction.ts`, `definitions.ts`, `index.ts`,
`world.ts`, `population/types.ts`, `population/state.ts`, `sim/src/constants.ts`.

Data/worker/UI: `packages/data/data/politics.json`,
`historical/countries_1900.json`, `historical/regions_1900.json`, scenarios,
`packages/data/src/load.ts`, `historical.ts`, `version.ts`;
`packages/sim-worker/src/protocol.ts`, `snapshot.ts`, `politicsPreview.ts`,
`reports.ts`, `actionHistory.ts`, generated scenario;
`packages/app/src/screens/PoliticsScreen.tsx`, `App.tsx`, generated worker bundle.

Tests/docs: `m8-politics.test.ts` (new), `fixtures/m8.ts` (new), fixed-digest and
report updates, `e1-ui-wiring`; GDD v2.12, D-076, README, this report,
`docs/M8_REQUIREMENTS_MAP.md`.

## 12. Verification commands and results

Run under the no-benchmark restriction:

- `pnpm run typecheck` — **pass** (all six workspace projects typecheck).
- `pnpm -F @century/tests test` — **pass: 62 suites / 663 tests**, 0 failures.
  The M8 suite contributes 13 tests; the E1 UI-wiring suite includes the Politics
  tab/action check.
- `pnpm run lint` — **pass** (163 TypeScript files; 55 in `packages/sim`).
- `pnpm run check:worker` — **pass** (generated scenario and app worker bundle are
  current).
- `git diff --check` — **pass** (no whitespace errors).
- `pnpm run ci` was **not** run because its script invokes `pnpm bench`; that
  aggregate gate is therefore explicitly omitted under the no-benchmark restriction.

No `pnpm run bench`, `bench:campaign`, benchmark script/gate, profiling, performance
measurement, stress/soak run, full-campaign run, or benchmark-invoking CI command
was executed. No benchmark code, thresholds, or reports were modified.

## 13. Limitations and deferred work

- AI law proposals and AI institution funding are not implemented.
- Education/health/currency/colonial/military-service law mechanics are deferred.
- Trade law changes migration access only; tariffs/customs/agreements are E6a.
- Labor law changes organisation/grievance; minimum wages/hours/bargaining/pensions
  are E5.
- The player has no direct unrest/crisis-response button; only policy and outcomes
  change pressure.
- Riots/building damage and separate general-strike event content are not modeled.
- Clerk-based administration is a documented simplification; government
  employment/service buildings are not modeled.
- Institution coefficients, law durations/support threshold, event content, and
  infrastructure values are provisional, not calibrated.
- Native/device verification remains under the M7 exception.
