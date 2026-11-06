# M11 design record — historical world, country selection, map, sliders, UI

Status: implementation design record for M11. This file records the decisions
that the code and data implement; the authoritative game specification remains
the GDD (`Fabric_of_Nations_GDD.md`) and `DECISIONS.md`.

## 1. Historical classification and start date

Start date is **1 January 1900** (`dayIndex = 0`; GDD §2 and `packages/sim/src/calendar.ts`).

Classification used by the catalog (`polities_1900.json`):

| Status | Meaning | Selectable |
|---|---|---|
| `independent` | Sovereign state with no superior power in 1900 | yes |
| `personal-union` | Separate state institutions under a shared crown (Norway–Sweden) | yes |
| `autonomous-vassal` | Self-governing but tributary/suzerain (Bulgaria) | yes |
| `dominion` | Self-governing colony with responsible government (Canada, Australia, New Zealand, Newfoundland) | yes |
| `self-governing-colony` | Representative government without dominion status | no |
| `protectorate` | Local ruler under a protecting power's foreign-affairs control | no |
| `colony` | Administered dependency without sovereign status | no |
| `occupation` | Recognised government under foreign military occupation (Cuba) | no |
| `autonomous-province` | Autonomous province under suzerainty plus occupation (Egypt) | no |

The independence coding is checked against the Gleditsch–Ward / Correlates of War
tradition that CShapes 2.0 documents. The catalog is authored, not copied from
CShapes (see §7). Every entity the catalog marks `independent`, `personal-union`,
`autonomous-vassal` or `dominion` is selectable and is backed by a simulation
country that can start a campaign.

## 2. World representation

One coherent world, not per-country campaigns.

- A **state** catalog entry becomes one `Country`.
- A state has exactly one **home region** plus one region per dependent
  **territory** whose `sovereignTag` names it.
- A **territory** catalog entry becomes one `Region` owned by its sovereign
  country. It therefore carries its own population, buildings and market
  membership, and the map can resolve it to an authoritative `regionId`.
- Dependencies are never marked independent. Their status, sovereign and capital
  are surfaced through `RegionSnapshot` metadata and the game's territory panel.
- All of a country's regions (home + dependencies) sit in that country's single
  market, preserving the M5 one-market-per-country invariant. Imperial markets
  are therefore customs areas, not claims that colonies are the metropole.

This keeps the world at 66 selectable states and 133 regions rather than a
separate country entity for every dependency, which matters for authoritative
tick cost and snapshot size.

## 3. Markets

Each state declares a market key. The generated market table groups states into
20 documented markets (national, imperial, or shared trade areas). A market is
not assumed to be one country: the Latin American, Balkan, East Asian, Persian
Gulf, Central American, Caribbean, Gran Colombian, Andean, South Atlantic,
Northern European, Alpine, Southern African and African independent markets
contain several member countries. Market metadata (display name, description,
kind) is authored in the catalog, derived from membership, and never presents an
opaque `Market N` as the player-facing identity. The numeric id remains visible
only as secondary diagnostic text.

## 4. Simulation contracts

- `EconomyScenarioDef` gains optional static metadata arrays `countryMeta`,
  `marketMeta` and `regionMeta`. They are scenario content, not authoritative
  mutable state: no serialized world field and no world-schema bump.
- `SimulationSnapshot` gains `countrySummaries` and `focusCountryId`, and keeps
  full `countries` detail for the player country plus the focused country only.
  This is required for a 1.6-billion-person world: a full 35 KiB detail record
  per country would exceed 3 MiB per snapshot at 60+ countries.
- Worker protocol 14 adds `CREATE_GAME` (validated player-country selection) and
  `SET_FOCUS` (presentation-only country focus), and the `NEW_GAME_RESULT` event.
- Saves already persist `playerCountryId`; no save-format change is needed.
  The host re-attaches static metadata from the scenario after `LOAD`.

## 5. Map

- Geometry source: **Natural Earth 1:50m** admin-0 countries and admin-1
  provinces, public domain. Reviewed alternatives were rejected for licensing:
  CShapes 2.0 is CC BY-NC-SA 4.0 (non-commercial, share-alike) and
  historical-basemaps is GPL-3.0 (copyleft). Neither is bundled.
- The build script aggregates modern source units into 1900 polities using an
  explicit crosswalk in the catalog, dissolves shared internal edges, simplifies
  and quantizes coordinates, and writes a committed JSON bundle. The game never
  fetches map data at runtime.
- Projection: Natural Earth (NE2) pseudocylindrical, computed in app code.
  Rings are pre-split at the antimeridian by the source data; the renderer also
  splits any remaining crossing ring.
- Rendering: `react-native-svg` (MIT, Expo 58 bundled version 15.16.0) with a
  custom pan/zoom shell. Layers: political sovereignty fill, occupation overlay,
  market membership tint, selection, borders, capital markers, labels.
- Small states are drawn with a minimum-size marker and remain selectable.

## 6. Sliders

Every continuous player-controlled numeric input uses a slider with a paired
editable value field (precision), units, min/max/step, threshold ticks and live
preview. Discrete/categorical choices (law proposals, technology choice, speed,
market/country selection, dates, booleans, confirmations) are explicitly
excluded in `docs/M11_SLIDER_INVENTORY.md`.

Slider commits are coalesced: the latest value wins, a new commit is held while
the previous validated action is in flight, and stale commits are discarded.
The authoritative action still travels through `APPLY_ACTION`.

## 7. Data provenance

- Population totals: OWID long-run population and Maddison Project Database 2023
  (CC BY 4.0), rounded national estimates. Confidence is recorded per entry.
- Occupation/urbanisation/literacy structure: authored provisional allocation
  informed by OWID employment-by-sector reconstructions; not measurements.
- Status, capitals, market grouping, building levels, fiscal and technology
  starting state: project-authored provisional content.
- Geometry: Natural Earth 1:50m (public domain).
- CShapes 2.0 and historical-basemaps were consulted for classification only and
  are not redistributed.

All synthetic values are labelled provisional in the UI and in source notes.
