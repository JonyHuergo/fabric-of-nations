# Map data preparation (M11c)

The world map is an offline, bundled vector artifact. This document explains the
sources, the build steps, the historical-transfer model and the validation
pipeline. Historical provenance and the per-polity audit table are in
[`HISTORICAL_MAP_PROVENANCE.md`](./HISTORICAL_MAP_PROVENANCE.md).

## 1. Runtime artifacts

| Artifact | Purpose |
|---|---|
| `packages/data/data/map/world_map_1900.json` | canonical generated geometry for validation and other consumers |
| `packages/data/data/map/world_map_1900_audit.json` | generated validity, overlap and coverage audit |
| `packages/app/src/generated/worldMap1900.ts` | typed module imported by the app |
| `packages/data/data/historical/m11/boundaries_1900.json` | authored 1900 transfers and per-polity provenance |
| `packages/data/data/historical/m11/polities_1900.json` | polity catalog, status, capitals, market and geometry crosswalk |
| `packages/app/src/generated/worldCatalog.ts` | generated pre-game catalog used by the menu and picker |

The app never downloads map data, tiles, fonts or API keys at runtime.

## 2. Sources

Base geometry and reconstruction blocks:

- **Natural Earth 1:50m cultural vectors** (admin-0 countries and selected
  admin-1 provinces), public domain. <https://www.naturalearthdata.com/>
- **Natural Earth 1:10m admin-1 states/provinces**, public domain. Used only as
  modern reconstruction blocks for historical provinces, not as a 1900 border.
- **Natural Earth 1:10m admin-0 countries**, public domain. Used for small
  island additions and clipping.
- **world-atlas 2.0.2** `countries-50m.json` (TopoJSON encoding derived from
  Natural Earth), ISC licence. <https://github.com/topojson/world-atlas>
- **polygon-clipping 0.15.7** (MIT), used only at build time for polygon union,
  intersection and difference.

Historical evidence for the transfers (full list in
`boundaries_1900.json`): Encyclopaedia Britannica 1911 country articles;
Hammond's Modern Atlas (1912); the 1900 administrative map of the German Empire;
the Treaties of Frankfurt (1871), Versailles (1919), Saint-Germain (1919),
Trianon (1920) and Lausanne (1923), used inversely to identify 1900 territory;
the Anglo-Egyptian Condominium Agreement (1899); and the British Aden record.

Reviewed and **not redistributed**:

- **CShapes 2.0** — CC BY-NC-SA 4.0; classification reference only.
- **historical-basemaps** — GPL-3.0; used only as a visual/topological
  cross-check for the German eastern frontier and the Ottoman Sahara. No
  coordinate ring from that dataset is redistributed; the final geometry is
  rebuilt from public-domain modern units and the explicit transfer polygons.

## 3. Build

```bash
# one-time downloads into the untracked cache
node scripts/m11/build-map.mjs
```

The script expects these files in `.cache-m11/` (it prints the download commands
if they are missing):

- `world-atlas-50m.json`
- `ne_50m_admin_0_countries.geojson`
- `ne_10m_admin_1_states_provinces.geojson`
- `ne_10m_admin_0_countries.geojson`
- `world-atlas-package.json` (licence metadata)

Then run:

```bash
node scripts/m11/build-boundaries.mjs   # expand the authored transfers/provenance
node scripts/m11/build-map.mjs          # build the map bundle
node scripts/m11/audit-map.mjs          # validity, overlap and coverage audit
node scripts/m11/generate-provenance-doc.mjs
```

### Processing steps

1. Decode the TopoJSON arcs with the quantization transform.
2. Resolve each catalog `geometry` key to source units:
   - `ADM0_A3` codes → world-atlas country geometry;
   - `adm1:XX-YY` codes → Natural Earth 1:10m admin-1 province (South Africa,
     Tibet, Khiva, Bukhara, Sarawak, the reconstructed sultanates, etc.).
3. Build the raw transfer shapes from `boundaries_1900.json` (admin-0, admin-1
   or authored polygon, with optional clip and subtract).
4. Intersect every transfer with its source polity's base geometry, so a
   reconstruction cannot spill across a generalized coastline.
5. Apply additions and removals with `polygon-clipping`. If a cumulative
   difference fails on a complex coastline, fall back to sequential removal and
   then to encoding the removal as a hole; the merge is logged as a warning.
6. Resolve residual overlaps deterministically: a transfer destination beats
   its source; otherwise the smaller/more specific polity keeps the sliver.
7. Simplify to a 0.02° Douglas–Peucker tolerance, close rings and delta-encode
   integer thousandths of a degree; record hole indices.
8. Store a label point (Natural Earth `LABEL_X/Y` where available, capital
   otherwise), a small-state flag, the boundary provenance, the reference date
   and the geometry/confidence classes.
9. Store the neutral land outline for genuinely unassigned land (Antarctica and
   omitted areas), filtered to rings above 0.02°².
10. Run `audit-map.mjs`: decode the final bundle, rebuild outer/hole grouping,
    check ring validity with `polygon-clipping`, compute pairwise overlaps, and
    sample land at 1° resolution for unassigned gaps.

## 4. Representation

- `polities[]`: one entry per catalog polity (133). `rings` is a flat list of
  delta-encoded rings; `holes` indexes rings that are holes. The renderer uses
  the even-odd fill rule.
- Every polity carries `provenance`: polity id and tag, historical name,
  reference date, boundary sources with URLs and licences, geometry class,
  confidence, underlying boundary date, deviations from the modern map, known
  uncertainties, transfer ids and optional composite components (for example
  Ottoman Tripolitania/Cyrenaica/Fezzan).
- **No marker-only polities remain.** M11b's marker entries were replaced by
  reconstructed polygons; the map renders every catalogued polity as a
  territory.
- A polity's `id` is its simulation country id (states) or region id
  (territories). Dynamic ownership and control are read from the snapshot.
- **South Africa**: the Cape Colony, Natal, the Transvaal and the Orange Free
  State use admin-1 province unions. The outer border is an approximation; the
  1900 republican borders differed from the modern provinces.
- **Antimeridian**: rings are unwrapped; the renderer draws each ring at
  −360/0/+360 offsets. The Miller projection has linear longitude, so the
  offsets are exact.
- **Small states**: `small` marks polities whose total ring area is below
  0.5 deg². They are drawn as markers at all zoom levels; click targets use the
  marker.
- **Labels**: shown by area threshold and zoom.

## 5. Projection

Miller cylindrical, implemented in `packages/app/src/components/WorldMap.tsx`:

```
y = 1.25 · ln(tan(π/4 + 0.4·φ))
x = (λ + 180) / 360
```

The map is drawn in a 1000×500 viewBox and letterboxed with
`preserveAspectRatio="xMidYMid meet"`. Pan/zoom applies an SVG group transform;
hit testing inverts that transform and uses even-odd point-in-polygon with a
bounding-box prefilter.

## 6. Validation

`packages/tests/src/m11c-geography.test.ts` checks:

- every catalog polity has one map entry, one provenance record and the
  1 January 1900 reference date;
- every geometry is classed, dated, sourced and confidence-labelled;
- no marker-only entries remain;
- Germany includes Alsace-Lorraine, the Prussian east, North Schleswig,
  Eupen-Malmedy and Memel, and excludes Congress Poland, Austria-Hungary,
  France, Denmark and Switzerland;
- Libya resolves to the Ottoman Empire at Tripoli, Benghazi, Sabha, Murzuq,
  Kufra and Ghadames; no `LBY` polity exists; the Libyan land area has no
  unassigned sample; the Aouzou strip stays with Chad;
- Austria-Hungary, Russia, the Ottoman Empire, Siam, British India, Tibet,
  Khiva, Bukhara, Sokoto, Wadai, Darfur, Jabal Shammar, Acre, Tacna,
  Newfoundland, Tonga and Sarawak resolve correctly at historical test points;
- the generated audit reports zero invalid rings, only the two documented
  coastline slivers (Canada/Newfoundland and Bolivia/Brazil) and only
  single-sample 1° coastal gaps;
- the app map module contains provenance and no runtime URL/fetch.

`packages/data/data/map/world_map_1900_audit.json` is regenerated by
`scripts/m11/audit-map.mjs`.

## 7. Updating

1. Edit the catalog's `geometry` crosswalk or the authored transfers in
   `scripts/m11/boundaries-1900-source.mjs`.
2. Re-run `node scripts/m11/build-boundaries.mjs`.
3. Re-run `node scripts/m11/build-map.mjs`.
4. Re-run `node scripts/m11/audit-map.mjs`.
5. Re-run `node scripts/m11/generate-provenance-doc.mjs`.
6. Rebuild the worker bundle if the catalog changed
   (`pnpm -F @century/app build:worker`).
7. Run `pnpm -F @century/tests test -- m11c-geography`.

Do not hand-edit the generated modules. The build is deterministic for the same
cache files and catalog.
