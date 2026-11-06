# M8 — Laws and Institutions: requirements map

Status: implementation planning record for M8. It maps the authoritative GDD v2.11
M8 definition (§9.1–§9.5, §17 milestone table, §17.5) to concrete code paths,
state changes, player actions, and tests. It is not a claim that every §9 design
intention is implemented; the "deferred" column is part of the scope decision.

## 0. E4 acceptance review (non-benchmark)

The E4 acceptance criteria are §17A.13.2 E4 and §17A.7/§17A.14 E4:

- at least one coherent industrial instrument changes actual enterprise, budget,
  production, or investment behavior and is testable;
- unsupported instruments are labelled dependencies, not decorative controls;
- no sector score or decorative modifier.

`packages/sim/src/economy/industrial.ts` implements a sectoral subsidy on verified
physical output with a treasury-cash limit and shortfall; `construction.ts` buys
actual market stock and capitalizes it; `industrialPolicy.ts` posts balanced
public-enterprise capital support. `packages/tests/src/e4-industrial-policy.test.ts`
covers the base, payment, shortage, rejection, accounting, save/load, and replay
paths. The reported deferrals (private co-financing, loans/guarantees, investment
tax credits, delayed/general procurement, public-enterprise expansion or
discontinuation) are explicitly listed as dependencies in §17A.7.2/§17A.7.3,
§17A.14 E4, and §17A.20, and the GDD requires such instruments to be labelled
until their predecessor mechanisms exist. They are therefore permitted deferrals,
not unmet mandatory criteria. **E4 satisfies the GDD; no E4 remediation is
required.**

## 1. Authoritative M8 criteria

| # | GDD source | Criterion | Existing subsystem / code path | M8 model and authoritative state | Player/worker actions | Tests |
|---|---|---|---|---|---|---|
| A1 | §9.1, §17 M8 | Interest groups are derived from pop blocks, have organisation/influence, and per-law stances; no spendable political pool | `Country`, `PopBlock.professionId`, economy profession definitions | `Country.interestGroups` (`InterestGroupState[]`) derived from block populations, profession keys, literacy, wealth, laws; monthly recomputation from state; influence normalised, never spendable | Read-only in snapshot; no action spends influence | membership sums to owned population; influence recomputable; stance differs by group/law; no action mutates influence except recomputation |
| A2 | §9.2 | Laws have prerequisites, eligible regimes, enactment duration, effects on concrete systems; enactment needs support, a legal path, and time; no political points | `Country.fiscal` bounds, `Country.immigrationOpen`, `Country.laws`, worker action validator | `LawDef` data (`politics.json`), `Country.laws: Record<LawSlot, Id>`, bounded `Country.lawTransitions`; effects applied on the effective day only | `propose-law` (enact/change/repeal via the slot's base law) | valid/invalid proposals, prerequisites, regime eligibility, support gate, effective-day timing, repeal, no retroactive effect, unauthorized actor rejection |
| A3 | §9.3 | Elections derive from enfranchised population under the suffrage law, use a documented rule, affect government composition, and do not run merely because a timer expired | new politics phase; `Country.regime` | `RegimeState` with kind, government group, next/last election day, bounded last result; suffrage law defines franchise; election only under an elected regime, positive franchise, and sufficient institution quality | no direct player election action; player observes | no election under absolute monarchy/no suffrage/low quality; election changes government when support < 0.5; deterministic rule; rescheduling recorded |
| A4 | §9.4, §17 M8 | Pop-level militancy and regional unrest have an explicit relationship; crisis/revolution arises from simulated causes, not hidden chance | `PopBlock.militancy`, new `Region.unrest`, needs counters | daily regional unrest from militancy, unmet needs, exclusion, overload, repression; `Country.regime.crisisStage`/`pressureDays`; deterministic stage thresholds; revolution changes regime/government/laws and disrupts institutions | player can reduce pressure only through real policy (laws, funding); no magic response button | unrest response to needs; crisis stages; revolution after sustained pressure; improvement avoids revolution; deterministic replay |
| A5 | §9.5 | Institutional quality derived from staffing, funding, literacy, infrastructure, law, disruption; overload has concrete effects on tax collection, construction, law enforcement, services | `fiscal.ts`, `construction.ts`, `production.ts` | `Country.institutions` (`InstitutionState`); daily funding payroll; monthly/daily derived quality/overload; tax collection efficiency; construction progress factor; enactment duration; unrest damping | `set-institution-funding` (annual SUSD target) | funding changes quality and actual tax revenue; low staffing/overload slows construction and law enactment; payroll balanced, cash-conserving; monthly reconciliation |
| A6 | §17 M8 | Scripted historical events are idempotent and carry provenance | new `World.politics.eventQueue`/bounded event log | event definitions in data; scheduled events apply once, recorded with provenance | none (scripted) | due event applies once; replay/duplicate applies nothing; provenance persisted; save/load |
| A7 | §17.5, §13, §14 | Complete simulation-to-UI integration; immutable snapshots; validated worker boundary | `packages/sim-worker`, `packages/app` | new snapshot sections; protocol 8 | `propose-law`, `set-institution-funding` DTOs; Politics screen | worker accepts/rejects; snapshot includes politics; UI wiring test; save/load snapshot parity |

## 2. Law slots

All nine §9.2 slots exist in state. Only slots whose effects can be real on
existing M8 systems are populated with proposable laws:

| Slot | M8 status | Real mechanism |
|---|---|---|
| Taxation | implemented | statutory bounds on income-tax and business-profit-tax rates; compliance clamp on the effective day |
| Suffrage | implemented | franchise definition used by elections; political exclusion in unrest |
| Labor | implemented | interest-group organisation, repression grievance, strike/crisis pressure |
| Trade | implemented (border access only) | `Country.immigrationOpen` (the GDD open-border law); tariffs/customs are E6a and remain deferred |
| Education, Health, Military Service, Colonial Policy, Currency | deferred, no proposable options | require M9/E5/M10/E6b mechanics; they are shown as explicitly not implemented, never as buttons |

## 3. Ordering and persistence decisions

- Events and effective law transitions run at the start of the day (pipeline step
  2), before AI/demography/market/fiscal. A law never rewrites a closed period.
- Institution funding payroll runs in the fiscal phase after income tax/welfare,
  so treasury reconciliation includes it and month-end close captures it.
- Unrest is updated after needs/militancy at the end of the day; its tax/construction
  effects are read at the start of the next day (one-day lag).
- Interest groups, institution quality, and election/crisis checks refresh before
  the market phase on the first civil day of a month (and at world creation).
- World schema 21, simulation 0.21.0, worker protocol 8, data version
  `m3-economy-v6`; old saves/clients are rejected; no migration (D-013).

## 4. Explicit deferrals

- Education/health/currency/colonial/military-service law mechanics (M9/E5/E6b/M10).
- Tariff, customs, and trade-agreement effects (E6a); the trade law only governs
  migration access.
- Minimum wages, hours, collective bargaining, pensions, and social insurance (E5b).
- AI law proposals, player crisis-response actions, riots/building damage, and
  general strikes as separate event content beyond the modelled strike stage.
- Any political-power/mana pool; influence is derived and unspendable.
