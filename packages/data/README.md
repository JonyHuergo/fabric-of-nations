# @century/data

Canonical static definitions for Century, stored as JSON under `data/`.

M2.1 includes:

- `data/needs.json` — four needs tiers and provisional basket quantities.
- `data/demography.json` — age-specific fertility and sex-specific mortality
  anchors; WPP 2024 for 1950/1975/2000 and provisional pre-1950 schedules.
- `data/scenarios/m2_world_aggregate.json` — source-backed 1900 total with a
  provisional 1900 age/sex distribution.
- `data/scenarios/m2_multi_block.json` — three-block needs/effects fixture.
- `data/scenarios/m2_wpp_1950_validation.json` — WPP 1950 age/sex-initialized
  validation scenario for 1975/2000 age structure.
- `data/calibration/m2_population_targets.json` — source-backed OWID world
  population series 1899–2000.
- `data/calibration/wpp_age_sex_reference.json` — WPP 2024 world age/sex,
  ASFR, and mortality references for 1950/1975/2000.
- `data/source_notes.md` — provenance, source conventions, calibration status,
  and missing inputs.

`src/load.ts` reads and validates these files through the `@century/sim`
population contracts. The loader is Node-side infrastructure, not simulation
logic. The total-population and WPP reference inputs are source-backed; the 1900
age structure and pre-1950 demographic schedules are provisional, so full
historical demographic calibration remains incomplete. M5 extends the data
pipeline.
