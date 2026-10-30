# GDD v2.18 change report

**Baseline:** `70250120f0dc32efdc4448fcac76eccc22272e08` (GDD v2.17, D-085,
world schema 26, simulation 0.26.0, worker protocol 13, data `m3-economy-v11`).

**Result:** GDD **v2.18** records M11 — Historical World, Country Selection, and
Complete UI Overhaul. World schema stays **26**, simulation becomes **0.27.0**,
worker protocol **14**, data **`m3-economy-v12`**, save format **1**.

## 1. Document-history correction

Batch 4 (`7025012`) edited `Century_GDD_v2.17.md` in place, adding the D-085
audit-remediation paragraphs. The original v2.17 text is restored exactly from
its pre-Batch-4 commit **`8c6a474`**, so prior versions are no longer silently
rewritten. The valid D-085 remediation record is preserved in v2.18, which is
built from the corrected `7025012` text. No earlier GDD file was overwritten.

## 2. What v2.18 records

- **§17I.1–17I.3 Historical catalog.** 60 states, 62 dependent territories, 18
  markets; 59 selectable states; documented classification and estimation
  status; the 1.52 bn modelled population is not presented as a world total.
- **§17I.2 World representation.** Territory entries become regions of their
  sovereign country, preserving the one-market-per-country invariant and D-081
  sovereignty/control separation.
- **§17I.4 Country selection.** Main menu → new game → date confirmation →
  map/list country selection → detail panel → validated `CREATE_GAME` →
  campaign. Player identity persists in authoritative state, saves, loads and
  worker restarts; AI excludes it.
- **§17I.5 Market identity.** Authored names/descriptions/kinds and complete
  membership; customs administration is distinct from sovereignty; no player
  surface uses an opaque `Market N`.
- **§17I.6 Map.** Offline Natural Earth/world-atlas geometry, 1900 crosswalk,
  build-time union/simplification/quantization, Miller projection, antimeridian
  offsets, political/control/market layers, pan/zoom/touch/hover, small-state
  markers, legend.
- **§17I.7 Sliders.** Reusable slider + numeric field, ranges/steps/units/ticks,
  accessibility, precision entry and coalesced authoritative commits.
- **§17I.8 UI redesign.** Main menu, selection workspace, map-first game shell,
  grouped navigation, contextual panels, design system, responsive layouts.
- **§17I.9 Contracts.** Scenario metadata, bounded snapshot (player + focus full
  records, all-country summaries), protocol 14 commands/events, versioning.
- **§17I.10–17I.12** determinism, invariants, acceptance mapping and limits.

## 3. Code and data changes

New data:

- `packages/data/data/historical/m11/polities_1900.json` (authored catalog).
- `packages/data/data/historical/m11/*_1900.json` (generated regions, countries,
  markets, populations, buildings, employment, calibration, trade routes).
- `packages/data/data/scenarios/m11_world_1900.json`.
- `packages/data/data/map/world_map_1900.json` (offline geometry).

New generators and dependency:

- `scripts/m11/build-world-data.mjs` (catalog → simulation tables + app catalog).
- `scripts/m11/build-map.mjs` (Natural Earth/world-atlas → map bundle).
- `polygon-clipping@0.15.7` (MIT) as a root devDependency for build-time union.

Simulation and worker:

- `EconomyScenarioDef.countryMeta/marketMeta/regionMeta`.
- `SimulationSnapshot.countrySummaries`, `focusCountryId`, country/region `meta`,
  market identity fields.
- Protocol 14: `CREATE_GAME`, `SET_FOCUS`, `NEW_GAME_RESULT`.
- `SimulationHost.createGame`/`setFocus` with selection and focus validation.
- `loadM11World()` and `loadHistoricalData(path)`; the legacy eight-polity loader
  is retained for tests.

App:

- New design tokens/design system, slider component, world map component.
- Main menu, new-game brief, country selection, game shell.
- Markets screen rewritten around market identity and membership.
- Overview identity header and market panel.
- Worker provider: menu-managed startup, `createGame`, `setFocus`, player-country
  recreation after worker restart.
- Slider conversions across Budget and the policy screens.

## 4. Verification

- `pnpm lint` — passed (198 TypeScript files, 60 in packages/sim).
- `pnpm typecheck` — passed for sim, data, sim-worker, bench, tests and app.
- `pnpm run check:worker` — generated world scenario current; committed worker
  bundle current.
- `pnpm -F @century/app build:worker` — bundle regenerated after the M11 source
  and protocol changes.
- `pnpm -F @century/app export:web` — static web export succeeded (Expo).
- `pnpm -F @century/tests test -- m11-world` — **21 tests pass**: catalog
  completeness, all-59-selectable-country initialization, 122-region world validation,
  AI exclusion, six-region host creation, rejection of dependencies/unknown ids, focus bounds, save/load
  persistence, snapshot size, market identity/membership, map geometry, action
  ranges, and protocol/supervisor handling of `CREATE_GAME`/`NEW_GAME_RESULT`.
- Full Jest suite: **822 of 823 tests passed** on the main M11 run (before the
  final all-selectable initialization test was added). The single failure was `batch5-validation`'s pinned world digest, which changes because
  M11 bumps the encoded simulation/data version metadata without changing that
  fixture's behaviour. The digest was re-pinned with a comment, and
  `batch5-validation` then passed 10/10 in isolation. All other suites and tests
  passed in that run; no other M11 regression was found. The added all-selectable
  test was run separately and passes (22/22 M11 tests).
- Browser smoke (Expo web export served locally):
  - main menu, new-game brief and country picker rendered;
  - `?country=JPN` created a campaign through `CREATE_GAME`, showing Japan's
    identity, 47.1 M population, treasury and Japanese Empire Market;
  - the World map rendered political fills, player highlight, labels, capital
    markers and legend;
  - the Markets screen listed the British Empire and Sterling Area's four member
    countries and 26 regions with customs and prices;
  - pressing the Budget income-tax slider's step button produced the
    authoritative result "Applied: tax 5.50%…";
  - a 500×900 viewport stacked the top bar, horizontal navigation, map and
    context panel.
- No benchmarks, profiling, stress/soak tests, full-campaign runs, `pnpm run ci`,
  or native device builds were executed, per the milestone restrictions.

- `pnpm -F @century/app typecheck` — pass.
- `pnpm -F @century/sim build`, `@century/data build`, `@century/sim-worker build` — pass.
- `pnpm -F @century/app build:worker` — regenerated bundle.
- `m11-world.test.ts` — 21 tests pass (catalog, world validation, AI exclusion,
  six-region country selection, rejection, focus bounds, save/load, snapshot
  size, market identity, map geometry, action ranges, protocol).
- Existing suites: see the completion report for the exact final run.
- The full-world tick cost and native exports were not benchmarked/verified;
  M11 was explicitly prohibited from running benchmarks or extended campaigns.

## 5. Deliberate deviations and limits

- The map uses modern source units aggregated into 1900 polities. Congress
  Poland, Alsace-Lorraine, Tibet, Xinjiang and Mongolia cannot be separated at
  this source resolution. South Africa is split with admin-1 provinces;
  Newfoundland is a marker territory inside the modern Canada polygon.
- The modelled world totals ~1.52 bn people, not the ~1.62 bn M2 estimate.
- Imperial markets include dependent territories because a country has one
  market; market membership is economic, not a sovereignty claim.
- Native iOS/Android export was not re-run; web is the verified target.
- Tick cost at the full world size is a bounded smoke observation, not a
  benchmark.
