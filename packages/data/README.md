# @century/data

Canonical static definitions for Fabric of Nations, stored as JSON under `data/`.

The package loads the 1900 world (`loadM11World`, from `data/scenarios/m11_world_1900.json`
and the tables it names under `data/historical/` and `data/map/`) and the reference tables
it and its generators read:

- `data/demography.json`, `data/politics.json`, `data/technology.json` — definitions the
  1900 world and `scripts/p5b/build-goods-1900.mjs` read.
- `data/historical_*.json`, `data/historical_1900_*.json` — catalogues the 1900 generators
  (`scripts/m11`, `scripts/p2`, `scripts/p2b`, `scripts/p5b`) read.
- `data/calibration/wpp_age_sex_reference.json`, `data/validation/` — WPP 2024 references
  (the 1900 demography definitions and the P4 validation).
- `data/scenarios/m2_world_aggregate.json` and `data/needs.json` — the M2 world-aggregate
  population scenario, which the 1900 world cites as the source of its provisional age
  structure and the M1/M2 benchmark runs (`loadM2WorldAggregate`).
- `data/scenarios/m5_eight_polities.json` and `data/historical/*_1900.json` — the M5
  sample, read by `scripts/m11/build-world-data.mjs` (its age structure) and by the test
  fixtures; the package no longer exports a loader for it.
- `data/source_notes.md` — provenance, source conventions, calibration status, and
  missing inputs.

D-155 (2026-11-11): the M2 multi-block and WPP-1950 scenarios, the M3 catalogue and
`m3_small_economy.json` moved to `packages/tests/src/fixtures/data` as unit-test
scaffolding, with their loaders; the M2 population-target series was removed.
