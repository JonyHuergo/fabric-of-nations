# GDD v2.17 change report — M10 Diplomacy, Warfare, and Territorial Control

This report records the M10 implementation delivered against `Century_GDD_v2.17.md`
(authoritative), GDD §11 and the M10 definition of done, and `DECISIONS.md` D-081. It
also records the resolution of **CEN-AUDIT-016**. It stops at M10; no follow-on milestone
is started.

## 1. CEN-AUDIT-016 — sovereignty and military control

**Decision (D-081).** Sovereignty and temporary military control are separate authoritative
facts:

- **Sovereignty** is `Country.regionIds` — the country that legally owns the region. The
  repository already used this as its only territory-ownership record; no duplicate
  `owner` field was introduced.
- **Military control** is `Region.controllerCountryId` plus `Region.occupiedSinceDay`.
  `null` means the sovereign controls the region.
- **Market membership** remains `Region.marketId`; the customs administration remains
  `Market.customsCountryId`. Neither changes on occupation or on a peace cession in M10.
- **Buildings, inventories, pop blocks, accounts, treasuries, debt, and monetary
  authorities** are independent relationships and are never transferred by occupation or
  cession. Taxes continue to accrue to the sovereign because fiscal assessment reads
  sovereign regions and their people; the occupier pays its own garrison cost.
- **Legal jurisdiction** follows the sovereign because a region has no separate government
  record; a ceded region is governed by the receiving country's existing laws/regime.
- **People** stay where they live. The one movement is military service: recruitment
  transfers people from a pop block into an army roster, with conservation asserted.
- **Only a validated peace-treaty cession changes sovereignty**, and only for regions the
  offering side actually controls. A country cannot cede its last region.

Where enforced: region/country state and validation, all five actions, peace terms,
occupation and liberation, fiscal assessment, recruitment/casualties, snapshots, and the
War tab. Tests assert that occupation changes control only and that cession changes
sovereignty only, with markets, people, treasury, buildings, and valuations unchanged.

## 2. Scope delivered

- **Diplomacy:** bilateral relation records (score, truce), `declare-war` with a documented
  casus belli, `offer-peace` (white peace or cession of controlled regions),
  `accept-peace`, a 365-day truce, and a minimal deterministic AI white-peace rule. No
  diplomatic-point pool.
- **Military organization and mobilization:** armies recruited from real working-age
  people, paid signing costs to their households, imported equipment purchased from the
  system supplier, formation delay, readiness, deployment delay, organization, supply, and
  paid daily upkeep. A treasury shortfall pays pro rata and erodes supply/organization; it
  never creates money.
- **Combat and casualties:** deterministic daily battles between hostile armies in one
  region; strength from personnel, equipment coverage, organization, and supply; keyed
  `m10-combat` RNG; losses split into deaths, wounded (return after 30 days), and captured;
  equipment loss; destroyed formations return their wounded to the population.
- **Occupation and liberation:** undefended at-war regions are occupied; the occupier pays
  a garrison cost and the region gains unrest; a sovereign army that removes the occupier
  liberates the region. No economic or ownership transfer.
- **Peace/territorial change:** white peace clears occupations; cession transfers
  sovereignty and `Country.regionIds` only. Market membership, buildings, people, cash,
  and monetary authorities are unchanged.
- **Fiscal/accounting:** `military-expense`/`military-income` accounts and
  `military-pay`/`military-procurement` postings, included in monthly and annual fiscal
  totals (`militaryExpenseSUSD`).
- **Worker/UI:** protocol-13 DTOs and parsers for all five actions, snapshot sections for
  armies/wars/offers/relations/occupation/casualties, and a War tab that calls the
  validated actions.
- **Versions:** world schema **26**, simulation **0.26.0**, worker protocol **13**, data
  **`m3-economy-v11`**; incompatible saves/protocols reject.

**Deliberately deferred:** alliances, sanctions, recognition, subject relationships,
treaties with ongoing terms, tactical combat, terrain/weather/fortifications, supply
lines, navies, war exhaustion, multi-term negotiated peace, independence/partition/
non-treaty annexation/regime change, domestic arms production, and AI war strategy.
These are recorded missing prerequisites, not exposed controls.

## 3. Cross-system invariants

| System | M10 behavior |
|---|---|
| Monthly/annual accounting | Military postings are ordinary balanced, cash-neutral entries in the open period; `militaryExpenseSUSD` is reported; closed periods are untouched. |
| Population/workforce | Recruitment moves people from pop blocks to armies; total people = civilians + roster + wounded + captured + military deaths is conserved in tests. |
| Buildings/construction/ownership | Unchanged by occupation or cession. |
| Markets/trade/customs (E6a) | Market membership and customs administration never change on occupation/cession; no shipment/duty/stock record is rewritten. |
| SUSD/monetary/FX (E6b) | Currency, parity, reserves, convertibility, and the price index are untouched; no conversion is introduced. |
| Laws/politics/AI (M8/M9) | The sovereign's laws/institutions continue; unrest rises in occupied regions; the AI uses the same validator plus its bounded peace rule. |
| Worker/UI | Snapshot-only presentation; every action is validated at the worker boundary and rejected atomically. |

## 4. Verification

No benchmarks, profiling, performance measurements, stress/soak tests, full-campaign
simulations, or benchmark-invoking CI were run. A benchmark entry
(`packages/bench/src/m10Bench.ts`, registered in `bench.ts`) was added and typechecked but
**not executed**; no threshold or result report was modified.

| Command | Result |
|---|---|
| `pnpm run typecheck` | Pass: sim, data, sim-worker, app, tests, and bench |
| `pnpm run lint` | Pass: 187 TypeScript files, 60 in `packages/sim` |
| `pnpm test` | Pass: 70 suites / 764 tests |
| `pnpm -F @century/tests test -- m10-warfare` | Pass: 16 M10 tests |
| `pnpm run check:worker` | Pass: generated scenario and app worker bundle current |
| `git diff --check` | Clean (exit 0) |

## 5. Files changed

Simulation: `packages/sim/src/economy/military.ts` (new), `types.ts`, `constants.ts`,
`accounts.ts`, `accounting.ts`, `state.ts`, `day.ts`, `ai.ts`, `period.ts`,
`validation.ts`, `index.ts`; `packages/sim/src/world.ts`, `serialization.ts`,
`population/state.ts`, `population/types.ts`, `constants.ts`.
Worker: `protocol.ts`, `snapshot.ts`, `actionHistory.ts`; app: `WarScreen.tsx` (new),
`App.tsx`; bench: `m10Bench.ts` (new), `bench.ts` (registration only). Data: scenario
versions, `historical.ts` (sample enables the military system), `src/version.ts`; generated
worker scenario and app bundle.
Tests: `m10-warfare.test.ts` (new), `fixtures/m5.ts`, `m7-supervisor.test.ts`, and
re-pinned known-answer digests.
Docs: `Century_GDD_v2.17.md`, `DECISIONS.md` D-081, this report, `README.md`.
