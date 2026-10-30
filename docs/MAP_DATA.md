# Map data preparation (M11)

The world map is an offline, bundled vector artifact. This document explains
the sources, the build steps and the representation rules.

## 1. Runtime artifacts

| Artifact | Purpose |
|---|---|
| `packages/data/data/map/world_map_1900.json` | canonical generated geometry for validation and other consumers |
| `packages/app/src/generated/worldMap1900.ts` | typed module imported by the app |
| `packages/data/data/historical/m11/polities_1900.json` | polity catalog, status, capitals, market and geometry crosswalk |
| `packages/app/src/generated/worldCatalog.ts` | generated pre-game catalog used by the menu and picker |

The app never downloads map data, tiles, fonts or API keys at runtime.

## 2. Sources

- **Natural Earth 1:50m cultural vectors** (admin-0 countries and admin-1
  provinces), public domain. <https://www.naturalearthdata.com/>
- **world-atlas 2.0.2** `countries-50m.json` (TopoJSON encoding derived from
  Natural Earth), ISC licence. <https://github.com/topojson/world-atlas>
- **polygon-clipping 0.15.7** (MIT), used only at build time for polygon union.

Reviewed and **not** used:

- **CShapes 2.0** — CC BY-NC-SA 4.0; non-commercial share-alike, not compatible
  with redistribution here. Used only as a classification reference.
- **historical-basemaps** — GPL-3.0; copyleft, not used.

## 3. Build

```bash
# one-time download into the untracked cache
node scripts/m11/build-map.mjs
```

The script expects these files in `.cache-m11/` (it prints the curl commands if
they are missing):

- `world-atlas-50m.json`
- `ne_50m_admin_0_countries.geojson`
- `ne_50m_admin_1_states_provinces.geojson`
- `world-atlas-package.json` (licence metadata)

It writes the committed JSON and the generated app module, then reports polity,
point and land-ring counts.

### Processing steps

1. Decode the TopoJSON arcs with the quantization transform.
2. Resolve each catalog `geometry` key to source units:
   - `ADM0_A3` codes → world-atlas country geometry;
   - `adm1:XX-YY` codes → Natural Earth admin-1 province (South Africa split).
3. Unwrap each ring at the antimeridian and shift it into a single 360° window
   (`normalizeWindow`) so union sees continuous coordinates.
4. Union all member polygons per polity with `polygon-clipping`. The source
   modern units are generalized independently, so their borders do not share
   vertices; a sweep-line union is required for a clean 1900 outline.
5. Drop sliver holes smaller than 0.05°².
6. Simplify with Douglas–Peucker at a 0.02° tolerance and close the rings.
7. Delta-encode integer thousandths of a degree and record hole indices.
8. Store a label point (Natural Earth `LABEL_X/Y` where available, capital
   otherwise) and a small-state flag.
9. Store the neutral land outline for unassigned land (Antarctica and omitted
   areas), filtered to rings above 0.02°².

## 4. Representation

- `polities[]`: one entry per catalog polity (133). `rings` is a flat list of
  delta-encoded rings; `holes` indexes rings that are holes. The renderer uses
  the even-odd fill rule. Entries with `markerOnly: true` have no rings and are
  drawn at their `label` capital point; `approximate` records the limitation.
- A polity's `id` is its simulation country id (states) or region id
  (territories). Dynamic ownership and control are read from the snapshot.
- **South Africa**: the Cape Colony, Natal, the Transvaal and the Orange Free
  State use admin-1 province unions. The outer border is an approximation.
- **Newfoundland**: `markerOnly`, because world-atlas cannot separate it from
  modern Canada. It is drawn as a marker over Canada and remains a real
  simulation region.
- **Antimeridian**: rings are unwrapped; the renderer draws each ring at
  −360/0/+360 offsets. The Miller projection has linear longitude, so the
  offsets are exact.
- **Small states**: `small` marks polities whose total ring area is below
  0.5 deg². They are drawn as markers at all zoom levels; click targets use the
  marker.
- **Labels**: hidden for marker-only polities; shown by area threshold and zoom.

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

`packages/tests/src/m11-world.test.ts` checks:

- every catalog polity has a map entry;
- marker-only entries have no rings;
- every ring has an even number of coordinates, at least four points, finite
  latitude within ±90° and longitude within the unwrapped window;
- no segment after unwrapping crosses the seam (≤181°);
- hole indices are in range;
- key polities (RUS, GBR, BIN, ZAR, ORF, CAP, NAT, NFD, FRA, CHN) are present.

## 7. Updating

1. Edit the catalog's `geometry` crosswalk.
2. Re-run `node scripts/m11/build-map.mjs`.
3. Rebuild the worker bundle if the catalog changed
   (`pnpm -F @century/app build:worker`).
4. Run `pnpm -F @century/tests test -- m11-world`.

Do not hand-edit the generated modules. The build is deterministic for the same
cache files and catalog.
