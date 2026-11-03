# Province geography and customs territories (P2 data)

Status: generated on 2026-11-02 from HYDE 3.3 (baseline scenario) after the D-128 geometry
repair; customs audit authored the same day; sourced population fixes in D-129.

## 1. HYDE 3.3 province allocation (D-121)

- **Dataset:** HYDE 3.3, History Database of the Global Environment (Klein Goldewijk,
  Utrecht University / PBL), DOI 10.24416/UU01-94FNH0, baseline scenario
  `hyde33_c7_base_mrt2023`. Licence CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/), as stated in the release readme;
  attribution is required wherever these values are shown or redistributed.
- **Files used (accessed 2026-11-02; downloaded by the designer, since the host requires
  a browser bot check):**
  - `original/hyde33_c7_base_mrt2023/zip/1900AD_pop.zip` (39.4 MB):
    `popc_1900AD.asc` (inhabitants per cell), `urbc_1900AD.asc` (urban inhabitants).
  - `original/hyde33_c7_base_mrt2023/zip/1900AD_lu.zip` (54.3 MB):
    `cropland1900AD.asc`, `pasture1900AD.asc`, `grazing1900AD.asc` (pasture plus
    rangeland), `tot_irri1900AD.asc` (all km² per cell).
  - `original/general_files.zip` (3.5 MB): `maxln_cr.asc` (maximum land area per cell, km²).
  - `original/readme_HYDE_3.3.txt` (units and licence).
- **Local layout (git-ignored):** archives in `.cache-hyde/downloads/`, the seven grids
  in `.cache-hyde/hyde-3.3/`.
- **Build:** `node scripts/p2/build-province-geography.mjs` (about 10 s) writes
  `packages/data/data/map/province_geography_1900.json` (486 KB); `--check` verifies
  every province has a record.
- **Grid:** 4320 × 2160 cells of 5 arc minutes; the headers print 0.0833333°, which the
  script snaps to exactly 1/12°.
- **Method:** each province's rings (0.001°, delta encoded) are filled with an even-odd
  scanline at grid row centres. A cell inside two provinces goes to the smaller one,
  the enclave, island or city within a coarser outline; equal areas go to the lower id.
  Non-empty cells outside every province go to the nearest covered cell within three
  cells; the rest is reported as unassigned.
- **Use:** within-country shares only. Country totals stay the authored OWID/Maddison
  values (D-121).

### Results

| Measure | Value |
|---|---|
| World population in the grids | 1,670.6 million |
| Unassigned population | 52,000 (0.003%) |
| Population moved to the nearest province (coastal cells) | 32.1 million (1.9%) |
| Overlapping cells | 97,205, of which 7 between different owners |
| Provinces with zero population | 75 (small islands and the four map defects below) |
| Catalog entries (133) without any province | 0 |

Entries whose provinces all receive zero HYDE population, so the P2 builder must split
their authored total by province land area instead: Monaco (MCO), German Pacific islands
(GPN), Macao (MAC), Guam (GUM).

### Data issues found (to resolve in P2)

- **Map geometry defects:** `as-bin-goa`, `as-mac-macao`, `grc-western-macedonia` and
  `mco-monaco` are slivers of 0.001–0.003 square degrees (Goa should be about 0.33);
  the surrounding provinces absorbed their area in the M12 build. Their populations are
  counted in the neighbouring province until the geometry is repaired.
- **Cuba ownership:** Cuba's provinces carry registry owner 1300 (the future Republic
  of Cuba) instead of the 1900 catalog country, so allocation must group by `mapTag`
  (catalog entry) rather than by owner, and P2 must decide Cuba's 1900 owner/controller.
- **Small islands:** the Azores and Guam have grid cells but zero HYDE land and
  population (HYDE's land mask omits them); they fall under the area fallback above
  only when their whole catalog entry is zero.
- **Authored totals vs HYDE:** country totals mostly agree (within ±35%); the largest
  gaps are Wadai and Darfur (catalog 2.0 million each, HYDE 0.34 and 0.64 million) and
  Sokoto (10.0 vs 7.7 million). Totals remain the authored values; the gaps are
  recorded for the P15 calibration review.

## 2. Customs territories (D-119)

`packages/data/data/historical/m11/customs_territories_1900.json` records the rules,
the four 1900 customs unions (Luxembourg–German Zollverein, Liechtenstein–Austria,
Monaco–France, San Marino–Italy), notes for states whose own tariff is notable (Norway,
Bulgaria, Crete, the dominions, Cuba), and dependent territories that historically set
their own tariffs but cannot yet administer a customs territory because they are not
simulated countries (Egypt, Finland, Newfoundland, Cape Colony, Natal). Result: 63
customs territories for 67 states, instead of the current 20 multi-country markets.

## 3. Geometry repair and data corrections (D-128, D-129)

Run order after any province change: `repair-provinces.mjs` and `repair-borders-1900.mjs`
(both start from the committed M12 bundles; keep a pristine copy, e.g. in
`.cache-hyde/bundle-backup/`, because they are not idempotent on already-repaired files),
then `apply-1900-data-corrections.mjs`, `sync-app-provinces.mjs`,
`build-province-geography.mjs`, `pnpm map:build`, `pnpm map:atlas`, the worker scenario
and the worker bundle. After the repair: 1,687 provinces, 28 overlapping cells (6 across
countries), 74 provinces with no HYDE population (small islands and the Western Macedonia
sliver); Monaco, the German Pacific islands and Guam use the sourced totals in
`province_population_1900.json`. Goa and Macao now receive their own population.

## 4. Province scenario (D-131, D-132)

Generated by `node scripts/p2/build-province-scenario.mjs` (`--check` verifies the
committed output; checksums of every input and output are in
`historical/p2/build_report.json`). Inputs are the authored territory tables in
`historical/m11/` (territories, population, buildings, countries, M11 markets for opening
stock, customs audit), the HYDE province geography, the sourced group totals and the
province bundles. Outputs in `historical/p2/`: province records (HYDE cropland and
grazing land in hectares, urban share, infrastructure), 5,687 population blocks, 3,725
buildings, 67 countries with their province ids, 63 customs-territory markets with
opening stock, 168 generated routes and an empty employment table; the runtime scenario
meta (`scenarios/m11_world_1900.json`) is rewritten with the new file paths, market,
country and territory metadata and the HYDE, customs, Goa and builder sources.

Distribution rules and their limitations are recorded in D-131; the ownership
reconciliation (Egypt, Newfoundland, Tokelau, the New Guinea residual, Goa) in D-132.

### Run order after any province or territory change

1. `repair-provinces.mjs` and `repair-borders-1900.mjs` (from the M12 bundles; keep a
   pristine copy, they are not idempotent on repaired files);
2. `apply-1900-ownership-corrections.mjs` (D-132; idempotent);
3. `sync-app-provinces.mjs` (also deletes the M12 `simulationRegionId` field, D-134);
4. `build-province-geography.mjs`;
5. `build-province-scenario.mjs`;
6. `pnpm map:build`, `pnpm map:atlas`, `pnpm -F @century/sim-worker scenario:build`,
   `pnpm -F @century/app build:worker`.

`convert-territory-inputs.mjs` (region tables to territory tables) and
`apply-1900-data-corrections.mjs` (D-129) ran once against the M11 region tables; both
stop or no-op on the converted tables and are kept as the record of those steps.
