# M11 1900 world data — source notes

Status: **provisional historical abstraction**. This directory is generated from
`polities_1900.json`; do not hand-edit the generated tables.

## Files

| File | Content |
|---|---|
| `polities_1900.json` | authored catalog: 67 states, 66 dependent territories, 20 markets, status, parent, capital, population estimate and confidence, continent, market, description, notes, sources, geometry crosswalk |
| `regions_1900.json` | 133 regions (one home region per state, one region per territory) |
| `countries_1900.json` | 67 countries, fiscal/debt/politics/technology starts |
| `markets_1900.json` | 20 markets with authored names, membership, customs administration and stock lots |
| `pops_1900.json` | 359 population blocks (region × profession) |
| `buildings_1900.json` | 548 building instances |
| `employment_1900.json` | empty; the first simulated day performs validated assignment |
| `calibration_targets_1900.json` | one population and one peasant-share target per country |
| `trade_routes_1900.json` | 47 market-to-market routes derived from capital-weighted market distances |
| `../../scenarios/m11_world_1900.json` | scenario metadata, sources, age profile and generated `countryMeta`/`marketMeta`/`regionMeta` |

Generate with:

```bash
node scripts/m11/build-world-data.mjs
```

The loader (`packages/data/src/historical.ts`) validates every table and throws
`HistoricalDataError` with sorted messages on any inconsistency.

## Sources

- **Population**: Our World in Data long-run population and Maddison Project
  Database 2023 (CC BY 4.0), rounded 1900 estimates. Per-entry confidence is
  `low`, `medium` or `high`.
- **Occupation structure**: broad historical agricultural-employment
  reconstructions (OWID, CC BY 4.0), used to choose wide provisional shares; the
  peasant share is an authored baseline, not a census measurement.
- **Status/classification**: the Gleditsch–Ward / Correlates of War independent-
  state tradition documented by CShapes 2.0 (CC BY-NC-SA 4.0). Consulted only as
  a classification reference; no CShapes geometry is included.
- **Capitals, market grouping, geometry crosswalk, fiscal/technology/building
  starts**: project-authored (`project-authored-1900`).
- **Map geometry**: Natural Earth 1:50m (public domain) via world-atlas 2.0.2
  (ISC). See `docs/MAP_DATA.md`.

## Transformations

1. Population totals are split across regions and profession blocks by
   development tier and the authored peasant share using deterministic
   largest-remainder arithmetic. Sums are exact.
2. Each block is expanded to 34 five-year age/sex cells using the shared
   provisional 1900 world age structure. This is not a country-specific age
   observation.
3. Initial savings are population × authored per-capita savings.
4. Building levels follow the calibrated sample ratios: rural regions carry
   grain and storage; the customs core and higher-tier countries carry
   processing, textiles, protein and workshops for the market. They are a
   structural starting point, not measured industrial capacity.
5. Market stock lots are capped by actual warehouse capacity and use an owner
   building inside the market.
6. Fiscal, law, technology, debt and currency starts are tier/status-driven
   authored parameters. All currency valuations are `unavailable`; no 1900
   exchange rate is invented.
7. The one-market-per-country invariant is preserved: a country's home and
   dependent regions share its market. Imperial markets are customs areas, not
   sovereignty claims.

## Known limitations

- Some 1900 borders cannot be separated from modern source units: Congress
  Poland (assigned to Russia), Alsace-Lorraine (France), Austria-Hungary's
  Galicia/Transylvania/Vojvodina/South Tyrol, and Xinjiang/Mongolia (Qing China).
  South Africa is split with admin-1 provinces; Newfoundland is a marker
  territory inside modern Canada.
- Sokoto, Wadai, Darfur, Jabal Shammar, Crete, Tonga, Tibet, Khiva, Bukhara and
  Sarawak use marker-only map integration because reliable 1900 polygons are not
  available at the map source.
- Some colonies are grouped (for example British West Africa, British Pacific
  islands, French West Africa), documented in their `notes`.
- The modelled population total is about 1.59 billion, closer to but still below
  the ~1.62 billion M2 world estimate.
- The world is not a complete historical census or a calibrated 1900 welfare
  model.
