# Fabric of Nations

Fabric of Nations is a historically grounded grand-strategy simulation covering
**1900-01-01 through the boundary at 2000-01-01**, one simulated civil day per tick. It
is a mobile game: iOS and Android in landscape are the product, and the web build is
the development environment.

> **Name.** The game was formerly *Century*. M13 rebranded the player-facing game,
> application metadata and current documentation to **Fabric of Nations**. Historical
> GDD versions, change reports and milestone reports keep their original wording as
> historical records in [`docs/archive/`](./docs/archive/README.md).
>
> **Unit name.** The unit of account was formerly **SUSD (Simulated US Dollars)** and
> is now **RUSD (Reference US Dollars)**. M14 changed the terminology, not the monetary
> model. Historical records keep the former term.

**RUSD — Reference US Dollars** is the simulation's fixed unit of measurement: one RUSD
has the purchasing power of one real-world US dollar of 1990 (D-122). It is a neutral
reference for comparing currencies, prices, wages and other values across countries. It
is not a national currency, legal tender, an issuer, or an adoptable currency, and it is
not the simulated US dollar, whose value moves in the simulation. Players see money in
their own (or a chosen) currency, converted only at display time (P3, D-141).

## Where things are

| Document | What it is |
|---|---|
| [`Fabric_of_Nations_GDD.md`](./Fabric_of_Nations_GDD.md) | The game design document: mechanics, scope and milestone acceptance criteria. Authoritative. |
| [`AGENTS.md`](./AGENTS.md) | Persistent engineering rules (determinism, No-Mana Doctrine, numerical integrity, mobile-first). |
| [`DECISIONS.md`](./DECISIONS.md) | The decision register, D-001 onward, with a generated index at the top. |
| [`docs/PROSPERITY_PROGRAM.md`](./docs/PROSPERITY_PROGRAM.md) | The current programme (P0–P15): stages, dependencies, tests and status. |
| [`docs/randomness.md`](./docs/randomness.md) | The keyed deterministic random generator. |
| [`docs/MAP_DATA.md`](./docs/MAP_DATA.md), [`docs/MAP_RENDERING.md`](./docs/MAP_RENDERING.md) | Map data pipeline and the renderer every platform runs. |
| `docs/*_PROVENANCE.md`, [`docs/1900_CATALOG_COVERAGE.md`](./docs/1900_CATALOG_COVERAGE.md), `docs/*_PROVINCIALIZATION.md`, [`docs/PROVINCE_GEOGRAPHY.md`](./docs/PROVINCE_GEOGRAPHY.md) | Sources, licences and audits for the 1900 world, its flags, fonts, provinces, land and resources. |
| [`docs/archive/`](./docs/archive/README.md) | Historical records: earlier GDD editions, change reports, completion reports, requirements maps, and the milestone history formerly in this README. |

The P4 and P5 completion reports stay at the repository root until those stages are
accepted.

## Workspace

| Package | Purpose | Runtime dependencies |
|---|---|---|
| [`packages/sim`](./packages/sim) | Pure deterministic simulation: calendar, keyed randomness, world state, population and demography, needs and wealth, economy (employment, production, markets, settlement), double-entry accounts, period close, fiscal loop, debt, AI, politics, technology and education, labour institutions, trade, monetary system, military, land and resources, save codec, state digest | none |
| [`packages/data`](./packages/data) | Canonical JSON definitions, the 1900 world tables and catalogue, sourced calibration tables, offline map JSON, and validated loaders | `@century/sim` |
| [`packages/sim-worker`](./packages/sim-worker) | Versioned worker protocol, bounded immutable snapshots, simulation host, save-storage codec, and Node/Web/WebView entries | `@century/sim`, `fflate` |
| [`packages/app`](./packages/app) | Expo/React Native mobile shell: the map mounted once under every screen, snapshot-only UI, Web Worker/WebView transports, save library | Expo, React Native, `@century/sim-worker` |
| [`packages/bench`](./packages/bench) | Headless Node benchmarks and performance probes | `@century/sim`, `@century/sim-worker`, `@century/data` |
| [`packages/tests`](./packages/tests) | The Jest suite, organised by subsystem (below) | `@century/sim`, `@century/sim-worker`, `@century/data` |

`packages/sim` compiles with `"lib": ["ES2022"]` and `"types": []`, has no runtime
dependencies, and imports only its own relative `.js` modules. It never imports the
app, data loader, benchmark, or platform code. Static definitions live as JSON under
`packages/data/data` and are passed explicitly through `TickContext`; they are not
serialized into `World`. The app never reads the live world: it consumes snapshots and
sends commands through the worker protocol.

## Requirements and commands

- Node.js **22.12.0 or newer** (Expo 58 prints an unsupported-runtime warning below
  22.13.0).
- pnpm **9.15.9** (never npm or yarn).

| Command | Effect |
|---|---|
| `pnpm install` | Install the workspace reproducibly from `pnpm-lock.yaml`. |
| `pnpm run build` | Compile every package in dependency order and regenerate the app worker bundle. |
| `pnpm run build:libs` | Compile `@century/sim`, `@century/data`, and `@century/sim-worker` in dependency order. |
| `pnpm run lint` | Boundary checks: no ambient RNG, no forbidden APIs in `sim`, ES2022-only config, no runtime deps in `sim`. |
| `pnpm run typecheck` | Build the workspace libraries, then typecheck every package in strict mode. |
| `pnpm test` | Run the Jest suite (about 30 minutes in band on a desktop). |
| `pnpm run bench` | Build and run the bounded Node benchmark cases with timings, hashes and invariant gates. |
| `pnpm run bench:campaign` | Opt-in full 36,524-tick campaign benchmark. Long-running. |
| `pnpm -F @century/bench perf` | Performance-stage benchmark on the 1900 world (Node diagnostic; device performance is measured by the designer). |
| `pnpm run check:worker` | Verify the committed worker scenario and app worker bundle without overwriting them. |
| `pnpm run audit:branding` / `audit:branding:dist` | Verify the official name in source, metadata and current documents (or in the web export). |
| `pnpm run audit:monetary` | Verify current RUSD terminology and the documented legacy save aliases. |
| `node scripts/docs/decisions-index.mjs` | Regenerate the `DECISIONS.md` index (`--check` verifies it; the test suite runs the check). |
| `pnpm map:atlas` / `map:atlas:check` | Build or verify the one-page map runtime every platform runs. Run after changing design tokens or `packages/app/src/map`. |
| `pnpm map:verify` / `map:verify:file` / `map:audit:sheets` | Browser checks of the map, touch, sheets and the page from a file origin. They need a GPU and `export:web`. |
| `pnpm -F @century/app web` | Start the Expo web development server. |
| `pnpm run app:export` | Export web, iOS, and Android JS bundles (not native release builds). |
| `pnpm run ci` | Local CI path: lint, audits, worker checks, typecheck, test, benchmark, and app exports. |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
runs the boundary checks, both terminology audits, generated-artifact checks,
typechecking and the test suite in a correctness job, then the bounded benchmark in a
separate job that depends on it, with a frozen lockfile.

## Tests

`packages/tests/src` is organised by subsystem; shared fixture worlds are in
`fixtures/` and keep the names the decision register uses for them ("the M5 sample",
"the M3 fixture").

| Folder | Protects |
|---|---|
| `architecture/` | Simulation isolation (ES2022 only, no DOM/React Native/Node/`Date`/`Math.random`), the No-Mana Doctrine, dependency cycles, generated-artifact drift, naming audits, the decision index |
| `determinism/` | Keyed RNG known answers, replay digests, the tick driver and calendar, rollback, per-tick validation |
| `serialization/` | Save envelope, typed-array encoding, round trips, and rejection of every earlier save version |
| `population/` | Population state, ageing, births and deaths, death allocation, calibration, needs, wealth, P4 demography, migration |
| `economy/` | Definitions, employment, production, inventory, market clearing, the economic day, multi-country markets and labour, land and resources, construction, industrial policy |
| `money/` | Ledger and accounts, settlement, period close, fiscal loop, debt, profit distribution, annual accounting, currencies, the monetary authority, money calibration, local-currency display |
| `trade/` | Routes, customs, quotas and trade conservation |
| `government/` | Country AI, the player country, politics, education, technology, military |
| `data/` | Historical data loaders, the 1900 world, catalogue coverage, flags, the province world |
| `map/` | Province bundles per continent, polity geography, the SVG fallback map, render bundle, camera, hit testing, labels, style |
| `ui-shell/` | Design tokens, the mobile shell, app wiring, the save library and storage adapter |
| `worker/` | The snapshot/command contract: host, supervisor, protocol, autosave, save store and preview, economic reporting |

## Determinism and saves

Identical initial state, seed, data version, simulation version and ordered player
actions produce identical results. Every random draw is a pure function of a stable
key (`docs/randomness.md`); the simulation never reads the clock. Authoritative state
is plain data and typed arrays with explicit, versioned serialization. Saves from an
earlier world schema, simulation version or content version are rejected with an
actionable error and never migrated (D-013, D-120); their metadata stays readable so
the save library can list them.

## Development workflow

1. Read `AGENTS.md` and the relevant GDD milestone.
2. Inspect `git status`; preserve unrelated changes.
3. Write/update tests before behavior.
4. Keep tuning coefficients in constants/data with units and calibration status.
5. Record substantive decisions/deviations in `DECISIONS.md` and regenerate its index.
6. Run `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run bench`.
   Map changes also use `pnpm map:check`, and `pnpm map:verify` on a machine with a GPU
   (`docs/MAP_RENDERING.md`).
7. Do not begin the next milestone until the current one is reviewed and the next
   phase is explicitly authorized in the GDD and task assignment.
