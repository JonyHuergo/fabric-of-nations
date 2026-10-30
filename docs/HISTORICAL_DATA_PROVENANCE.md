# Historical data provenance and licensing (M11)

This document records what the 1900 world contains, where each class of value
comes from, and what is intentionally approximate.

## 1. Scope and classification

- Start date: **1 January 1900**.
- Source of the classification: the Gleditsch–Ward / Correlates of War
  independent-state tradition as documented by **CShapes 2.0** (Schvitz et al.
  2022). CShapes is used only as a classification reference and is **not
  redistributed**.
- Catalog: `packages/data/data/historical/m11/polities_1900.json`.
- Contents: **67 states**, **66 dependent territories**, **20 markets**,
  **133 regions**, **66 selectable states**.

| Status | Count in catalog | Selectable |
|---|---|---|
| independent | 60 | yes |
| personal-union | 1 (Norway) | yes |
| autonomous-vassal | 2 (Bulgaria, Crete) | yes |
| dominion | 4 (Canada, Australia and New Zealand are selectable states; Newfoundland is a non-selectable territory) | 3 states |
| colony | 47 | no |
| protectorate | 12 | no |
| occupation | 1 (Cuba) | no |
| autonomous-province | 3 (Egypt, Finland, Tibet) | no |
| dependency | 3 (Iceland, Greenland, Faroes) | no |

Exact counts are asserted in `packages/tests/src/m11-world.test.ts`. The
independence/de-facto-state reconciliation is in
[`1900_CATALOG_COVERAGE.md`](./1900_CATALOG_COVERAGE.md).

### Why dependencies are not independent countries

Colonies, protectorates and occupied territories keep their own population,
buildings and market membership but are **regions of their sovereign country**.
They are never marked independent and cannot be selected as the player country.
Their status, sovereign and capital are visible in the picker and in the game's
region panel. This is a deliberate model decision (D-087), not an omission.

Examples of documented semi-sovereign cases:

- **Norway** is a separate kingdom with its own constitution and government in
  personal union with Sweden; it is selectable with the `personal-union` status.
- **Bulgaria** is a self-governing principality tributary to the Ottoman Empire;
  it is selectable with `autonomous-vassal` and is not described as independent.
- **Canada, Australia, New Zealand and Newfoundland** are self-governing
  dominions/colonies, not sovereign states in 1900; they are selectable as
  dominions and labelled as such.
- **Egypt** is an autonomous Ottoman province under British military occupation;
  it is a non-selectable territory. **Finland** is an autonomous Grand Duchy of
  the Russian Empire; it is a non-selectable territory. **Cuba** is under United
  States occupation and is non-selectable.

## 2. Data classes

| Class | Examples | Status |
|---|---|---|
| Historical fact | start date; constitutional status; capitals; parent sovereign; names used in 1900 | authored/historical reference |
| Historical estimate | 1900 population totals; broad occupation shares | OWID/Maddison rounded estimates, per-entry confidence |
| Model assumption | one market per country; territory-as-region; age structure reused for every country | documented in GDD/decisions |
| Provisional calibration | building levels; treasury; tax rates; technology starts; trade routes; market grouping | project-authored, labelled provisional |

No synthetic value is labelled as measured 1900 data in the UI. Population is
shown as an estimate with a confidence label; occupation and economic starting
values are described as documented approximations.

## 3. Sources and licences

| Source | Use | Licence | Redistributed? |
|---|---|---|---|
| Our World in Data — Population, long-run series | rounded 1900 population totals | CC BY 4.0 | values only |
| Maddison Project Database 2023 | cross-checks for population totals | CC BY 4.0 | values only |
| Our World in Data — Employment by sector | broad occupation-structure ranges | CC BY 4.0 | values only |
| Century M2 1900 world age structure | age/sex expansion for every block | project data | yes (project) |
| Century M11/M11c authored catalog and boundary transfers | status, capitals, markets, geometry crosswalk, 1900 transfers, boundary provenance, fiscal/technology/building starts | project data | yes (project) |
| Natural Earth 1:50m cultural vectors | map base geometry | public domain | yes, derived |
| Natural Earth 1:10m admin-0/admin-1 | historical reconstruction blocks and clipping | public domain | yes, derived |
| world-atlas 2.0.2 | TopoJSON encoding of Natural Earth | ISC | yes, derived |
| polygon-clipping 0.15.7 | build-time polygon union/intersection/difference | MIT | build tool only |
| CShapes 2.0 | classification reference | CC BY-NC-SA 4.0 | **no** |
| historical-basemaps | visual/topological cross-check only | GPL-3.0 | **no** (no coordinate ring redistributed) |

CShapes 2.0 is credited in the app's provenance dialog and in this document. Its
non-commercial share-alike licence is not compatible with redistributing a
derived map in this project, so no CShapes geometry is included.

## 4. Estimation and calibration details

- Population totals are rounded national estimates for 1900. Imperial and
  colonial boundaries are uncertain; entries carry `low`, `medium` or `high`
  confidence.
- The catalog's 1900 population sums to about **1.52 billion**, against the M2
  world estimate of about 1.62 billion. The difference is unrepresented or
  grouped territory, not a claim that the world is complete.
- Occupation structure: the authored `peasantShare` is the share of the
  population in the peasant profession. It is informed by broad agricultural
  employment reconstructions but is not the GDD's employed-worker agricultural
  share and is not a measured census value.
- Literacy, wealth, savings and militancy are authored by development tier and
  profession; they are not historical observations.
- Building levels follow the calibrated sample's per-capita ratios, adjusted for
  development tier and market hub role. They are a structural starting point, not
  a claim about actual 1900 industrial capacity.
- Market grouping is authored. Imperial markets group a metropole with its
  dependencies; shared markets group independent countries. They are not
  historical trade treaties.
- Currencies are identities only. All SUSD valuations are explicitly
  `unavailable`; no 1900 exchange rate is invented.
- Technology starts are tier-based subsets of the validated technology catalog
  and are not a claim that every country had exactly those capabilities.

## 5. Known omissions and approximations

- M11c reconstructs the 1900 external borders from explicit transfers; see
  [`HISTORICAL_MAP_PROVENANCE.md`](./HISTORICAL_MAP_PROVENANCE.md). Congress
  Poland remains Russian and is separated from the German Empire; Alsace-Lorraine
  is separated from France; Austria-Hungary includes reconstructed Galicia,
  Transylvania, Vojvodina, South Tyrol and the Littoral; Tibet is separated from
  Qing China; and the former marker-only polities have reconstructed polygons.
- **Aouzou–Tibesti** is a map-only disputed/no-established-administration zone,
  not FEA or OTT; see `HISTORICAL_MAP_PROVENANCE.md` §3a and the ICJ sources.
- Xinjiang and Mongolia remain inside Qing China at this resolution; Tibet is a
  separately drawn autonomous-province territory of China.
- South Africa is split into the Cape Colony, Natal, the Transvaal and the Orange
  Free State using modern admin-1 provinces as an approximation.
- Newfoundland is separated from the modern Canada polygon.
- Several small dependencies are grouped (for example British West Africa,
  British Pacific islands, French West Africa). The grouping is documented in
  each territory's notes.
- Sokoto, Wadai, Darfur, Jabal Shammar, Crete, Tonga, Tibet, Khiva, Bukhara and
  Sarawak have reconstructed 1900 polygons with explicit LOW/MEDIUM confidence;
  no marker-only map entry remains. Their frontier approximations are documented
  in [`HISTORICAL_MAP_PROVENANCE.md`](./HISTORICAL_MAP_PROVENANCE.md).
- Ashanti, Bornu (Rabih), the Somali Dervish state, Zanzibar, Sikkim and the
  smaller Arabian and Pacific polities are deliberately not separate state
  entries; the precise reasons are recorded in
  [`1900_CATALOG_COVERAGE.md`](./1900_CATALOG_COVERAGE.md).

## 6. Updating the data

1. Edit `polities_1900.json` (the canonical authored catalog) or the boundary
   transfers in `scripts/m11/boundaries-1900-source.mjs`.
2. Run `node scripts/m11/build-world-data.mjs`.
3. If geography changed, run `node scripts/m11/build-boundaries.mjs`,
   `node scripts/m11/build-map.mjs`, `node scripts/m11/audit-map.mjs` and
   `node scripts/m11/generate-provenance-doc.mjs`.
4. Rebuild the libraries and the worker bundle:
   `pnpm -F @century/sim build && pnpm -F @century/data build && pnpm -F @century/sim-worker build && pnpm -F @century/app build:worker`.
5. Run `pnpm -F @century/tests test -- m11-world m11b-coverage m11c-geography`
   and the ordinary checks.

Every population, region, market and country entry must reference a registered
source id. The loader rejects unknown sources, missing calibration targets,
unknown professions, duplicate ids and inconsistent metadata.
