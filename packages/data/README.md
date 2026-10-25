# @century/data

Canonical static definitions for Century, stored as JSON under `data/`.

M3a includes all M2.1 population content plus:

- `data/goods.json` — eight M3 goods.
- `data/professions.json` — four provisional M3 profession definitions.
- `data/buildings.json` — eight M3 building definitions.
- `data/m3_needs.json` — M3 needs; services are deferred.
- `data/scenarios/m3_small_economy.json` — synthetic single-region,
  single-market structural fixture.

The M3a loader validates the economy definitions and returns an explicit
`EconomyScenarioDef`. It does not simulate production, employment matching,
market clearing, wages, or prices. M3 recipe, population, and price values are
provisional synthetic inputs, not historical calibration.

M2.1 content remains under `data/`:

- `data/needs.json` — M2 four-tier needs fixture.
- `data/demography.json` — age-specific fertility and sex-specific mortality
  anchors; WPP 2024 for 1950/1975/2000 and provisional pre-1950 schedules.
- `data/scenarios/m2_*.json` — population-only scenarios.
- `data/calibration/m2_population_targets.json` — OWID world population series
  1899–2000.
- `data/calibration/wpp_age_sex_reference.json` — WPP 2024 world age/sex, ASFR,
  and mortality references for 1950/1975/2000.
- `data/source_notes.md` — provenance, source conventions, calibration status,
  and missing inputs.
