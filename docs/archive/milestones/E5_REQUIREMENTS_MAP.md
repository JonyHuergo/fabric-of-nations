# E5 — Labor and Social Institutions: requirements map

Status: implementation planning record for E5. It maps the authoritative GDD v2.14
§17A.9, §17A.13.2 E5, §17A.14 E5, §17.5, §6.7–§6.8, and §9.2 to concrete code paths,
authoritative state, simulation phases, player actions, and tests. It also records
the focused M9 closure review. The GDD is authoritative; the deferrals listed here
are part of the scope decision recorded in D-078.

## 0. M9 closure review (focused, non-benchmark)

Repository state at the start of E5: `main` at
`a81f9507c591112eea60ef10e757622db4196761`, clean working tree. That matches the
reported M9 final HEAD.

The M9 acceptance criteria (§17, §17D) are met: the technology tree validates; work
comes only from funded academic labour; effects change production, mortality,
literacy, building unlocks, and law eligibility; literacy is age-specific and
shifts with ageing/migration; the worker protocol and snapshots are integrated; and
the full correctness suite passes. The M9 interfaces E5 depends on are usable:
`deriveEducation` exposes available academic workers and the research/teaching
split; block adult literacy drives eligibility; education quality/funding are real;
the daily phase ordering is deterministic.

One narrow extension is required for E5, not an M9 remediation: the academic
research/teaching split must account for a third use (vocational training
instructors), and the administration institution must allow a health staff share
within its existing clerk base. Both are documented E5 scope decisions (D-078) and
default to zero, preserving M9/M8 behaviour exactly.

**Conclusion:** no mandatory M9 acceptance failure exists; no M9 remediation is
required.

## 1. Authoritative E5 criteria

| # | GDD source | Criterion | Existing subsystem / code path | E5 model and authoritative state | Player/worker actions | Tests |
|---|---|---|---|---|---|---|
| A1 | §17A.9, §17A.13.2 E5 | A supported social/labor policy changes actual household cash, service capacity, qualifications, employment, wages, or productivity through a documented channel and lag | `settlement.ts`, `production.ts`, `politics.ts`, `technology.ts` | Vocational **training** service: academic instructors, country budget, trainee participation, daily qualification gains. Qualification is a new authoritative `PopBlock.qualification`; it raises wages (`settlement`) and labour productivity (`production`) slowly. Training time reduces effective labour input. The training **stipend** is a separate immediate household transfer | `set-training-budget`, `set-training-stipend`, `set-training-staff-share` | wage/productivity change after training; qualification lag; stipend cash effect; no free qualification |
| A2 | §17A.9.2 | Immediate transfers and long-run human-capital effects are distinguishable | fiscal/education patterns; new training phase | Stipend is paid daily (immediate household cash); qualification accrues daily but only for eligible enrolled working-age people at a slow rate and with funding/staffing constraints. UI states the two time scales separately | same | stipend paid immediately; qualification unchanged on day 1; multi-month increase |
| A3 | §17A.9, §17A.14 E5 | A service capacity/spending policy is real: eligibility, capacity, funding, shortfall | M9 education pattern | Training capacity = academic instructors × trainees per instructor, capped; participation = min(cap, capacity/eligible working-age); funding adequacy from the training budget vs instructor benchmark; treasury limits payroll/stipend; unpaid request is an explicit shortfall, never debt | actions | zero budget/staff ⇒ zero training; treasury shortfall; eligible-literacy gate |
| A4 | §17A.9.1, §17A.9.3, §9.2 | Legal labor/health instruments require M8, have enforcement/constraint rules, and are not decorative | `LawDef`, `propose-law`, `politics.ts` | Labor-slot laws add a minimum-wage floor and a working-hours standard. Both act through actual wages/capacity and (hours) mortality, with employer-cost trade-offs. A health law sets a minimum health staff share. Enactment uses the existing support/regime/prerequisite/effective-day path | `propose-law`; `set-health-staff-share` bounded by the health law | law validation/timing; wage floor changes payroll; hours change capacity/wages/mortality; health floor enforcement |
| A5 | §17A.9.1 | Healthcare/public health has real service capacity and a slow outcome; not a pure transfer | M8 administration institution, demography | Public-health service is a player-set share of the existing state-administration clerk staff. It reduces administration staffing/quality (real trade-off), is funded by the existing administration payroll, and produces a derived mortality factor applied in demography. No new money or duplicate people | `set-health-staff-share` | health share reduces admin staffing; increases health service; lowers deaths; zero share inert |
| A6 | §17A.9.1 | Migration policy integrates with law/institution rules and preserves population | M5 migration, M8 trade law | No duplicate border action: the M8 trade law's open/restricted policy is the legal path for cross-country migration access. E5 verifies that an enacted trade law changes migration eligibility and that migration conserves population | existing `propose-law` | trade law effect on migration access; population conservation |
| A7 | §17A.9.3, §17A.14 E5 | Unsupported pension/bargaining/labor-market mechanisms are explicitly deferred, not faked | — | Pensions/social insurance, collective bargaining, and labor-market information/enforcement are deferred with recorded reasons and no controls | none | documentation and absence of controls |
| A8 | §13, §14, §16 | Deterministic, bounded, serialized, validated implementation | simulation/worker/app | New state is plain data: `Country.labor`, `PopBlock.qualification`, `InstitutionState.healthStaffShare`, and training/health memo fields. New accounts/kinds are balanced. Schema/protocol/data versions bump; old saves/clients rejected | M9-style DTOs | determinism, save/load, accounting conservation, bounded state, worker snapshot/action tests |

## 2. Implemented instruments

| Instrument | E5 status | Real mechanism |
|---|---|---|
| Vocational training service + stipend | implemented | Capacity/staff/funding → participation; daily qualification gains; stipend transfer; wages/productivity |
| Public health service | implemented (documented simplification) | Share of administration clerk staff → health service output → mortality factor; reduced admin staffing |
| Minimum wage law | implemented | Statutory annual floor applied to daily wage obligations; employer cash-limited payment |
| Working-hours/standards law | implemented | Hours factor on capacity and wages; small mortality improvement; no free productivity bonus |
| Public health law | implemented | Minimum health staff share enforced on the player action |
| Welfare transfers | existing E2 | unchanged immediate transfer; training stipend adds an E5 immediate transfer |
| Migration policy | existing M8 trade law | border policy already changes `Country.immigrationOpen`; no duplicate action |
| Pensions/social insurance | deferred | Requires contribution/eligibility rules and an explicit liability model; no control |
| Collective bargaining | deferred | M8 labour organisation/influence is an aggregate political measure, not bargaining coverage; no control |
| Labour-market information/enforcement | deferred | Requires a distinct placement/enforcement service model; no control |

## 3. Authoritative state summary

- `Country.labor`: training budget, stipend rate per trainee, academic training staff
  share, monthly training participation, month-to-date requested/shortfall, last
  update day.
- `PopBlock.qualification`: vocational qualification rate (0..1) for the block's
  working-age people. Initialised to 0 (no source-backed qualification data); built
  only by funded training.
- `Country.institutions.healthStaffShare`: share of the administration clerk base
  assigned to public health (0..1). Administration staffing is net of it.
- `LawDef.laborMinimumWageSUSDPerYear`, `LawDef.laborHoursPerWeek`,
  `LawDef.healthStaffFloor`.
- Finance: `training-payroll` and `training-stipend` postings; training expense and
  budget memo fields.

Derived values (instructor count, training quality, participation, health staffing,
health service output, mortality factor) are recomputed from authoritative state;
they are not a second authority.

## 4. Ordering and timing

1. Politics: effective laws, monthly institution/interest-group refresh (which nets
   health staff from administration).
2. `runLaborMonthStart` (first civil day): compute training participation from
   academic instructors, budget, and eligible working-age population. Training is
   part-time, so employment assignments are not invalidated.
3. Demography reads the combined mortality factor (technology × health × hours) at
   day start.
4. Employment/migration (unchanged); migration access follows the M8 trade law.
5. Production reads the hours factor and each assigned block's qualification and
   training time cost.
6. Settlement pays wages with the minimum-wage floor, hours factor, and
   qualification premium.
7. Fiscal phase, then `runTrainingPhase`: treasury-limited training payroll to
   academic households and stipend to trainee households; qualification gains for
   participating blocks. A failed/retried day cannot apply either twice.
8. Close/history (unchanged except the new expense line).

## 5. Accounting summary

| Flow | Posting | Effect |
|---|---|---|
| Training payroll (instructors) | Country `training-expense` debit / treasury credit; academic household cash debit / `training-income` credit (`training-payroll`) | Cash-neutral provider payment; treasury-limited |
| Training stipend (trainees) | Country `training-expense` debit / treasury credit; trainee household cash debit / `training-income` credit (`training-stipend`) | Cash-neutral immediate transfer; treasury-limited; unpaid request is a shortfall |
| Health service | existing `administration-payroll` | No new flow; the health staff share is an allocation of the existing funded administration institution, reported as a derived share |
| Minimum wage / hours | existing `wages` posting | Changes the wage obligation actually paid; no new money |

Fiscal totals add `trainingExpenseSUSD`; budget totals add
`trainingRequestedSUSD`/`trainingShortfallSUSD` (sparse). `netFiscalResultSUSD`
subtracts training expense.

## 6. Scenario/data changes

- `politics.json`: health-public law (minimum health staff share) and two labor laws
  (minimum wage, hours standard); regime defaults unchanged (no health law).
- Scenario/country inputs: `labor` policy and `healthStaffShare` default to neutral
  (zero) so the historical M8/M9 trajectory is not silently rewritten; the player
  enables them. Data version bumps to `m3-economy-v8` because law definitions and
  scenario inputs changed.
- No new profession or population block is added: training uses existing academic
  instructors and qualifies existing working-age people; health uses the existing
  administration clerk base. This avoids inventing a health workforce or
  double-counting people, and is documented as a simplification.

## 7. Explicit deferrals

Pensions/social insurance, collective bargaining, labour-market
information/enforcement, unemployment insurance, cross-profession promotion, and
health-specific practitioner professions are deferred with reasons. E6 trade/monetary
and M10 systems are untouched.
