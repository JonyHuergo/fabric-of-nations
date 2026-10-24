# @century/data

Canonical static definitions for Century, stored as JSON under `data/`.

M2 includes:

- `data/needs.json` — four needs tiers and provisional basket quantities.
- `data/demography.json` — provisional mortality/fertility anchors and fertility
  multipliers.
- `data/scenarios/m2_world_aggregate.json` — single-region synthetic calibration
  fixture.
- `data/scenarios/m2_multi_block.json` — three-block needs/effects fixture.
- `data/calibration/m2_population_targets.json` — source-backed OWID world
  population series 1899–2000 (Gapminder v7 / UN WPP 2024), with year-convention
  and provenance metadata.
- `data/source_notes.md` — source status, interpolation convention, GDD-anchor
  discrepancies, and missing age-specific inputs.

`src/load.ts` reads and validates these files through the `@century/sim`
population contracts. The loader is Node-side infrastructure, not simulation
logic. The total-population reference is source-backed; age-specific demographic
inputs remain provisional, so full demographic calibration is partial. M5
extends the data pipeline.
