# Map rendering

How the world map is compiled and drawn. `docs/MAP_DATA.md` covers the authoritative
polity and province data; this document covers the display layer built on top of it.

## 1. Principles

- **Authoritative data is an input, never an output.** The render bundle is compiled
  from `packages/data/data/map/*.json`. Province ids, ownership, polity geometry and
  gameplay granularity are not changed by anything described here.
- **Display geometry may be finer than authoritative geometry.** The 1:10m coast
  defines what the player sees; the authoritative province decides who owns a point.
- **No remote services at runtime.** Every map asset ships with the application and
  is served from the same origin.

## 2. Pipeline

`pnpm map:build` runs `scripts/map/build-render-bundle.mjs`. `pnpm map:check` rebuilds
in memory and fails if the committed bundle differs. A Jest test separately compares
the SHA-256 of the province files recorded in the bundle against the current files,
so a stale bundle fails `pnpm test` without any download.

Outputs, in `packages/app/public/map/`:

| File | Contents |
|---|---|
| `world-render-v1.bin` | Gzip of the binary below, about 5.8 MB |
| `relief-v1.jpg` | Shaded relief resampled into the map projection |
| `ocean-v1.jpg` | Ocean-bottom relief resampled into the map projection |

Bundle sections (geographic integers at 0.001 degrees, delta and varint encoded, and
projected at load by `packages/app/src/map/projection.ts`):

- **Province fills.** Earcut triangles, one vertex run per province in catalogue order.
- **Land and lakes**, three levels of detail. Natural Earth 1:10m land and minor
  islands. Small islands survive coarse levels as minimal diamonds.
- **Coast lines**, three levels. Each segment knows its nearest province, so a selected
  country can be outlined along the real coast.
- **Border lines**, three levels. Each segment records the two provinces it separates.
- **Rivers**, three levels, as a geographic reference layer.
- **Nearest-province raster**, 4096 cells wide. Bit 15 marks land; the rest is the
  province index, grown outward from the rasterised provinces.
- **Province moments**: area, centroid and second moments, for label fitting.

### Shared borders

Provinces were simplified independently, so 117,141 of 170,721 unique ring edges have
no exact partner. The source `borders` lists therefore classify many shared edges as
coast. The compiler probes both sides of every `b = -1` segment against the exact
province polygons; a segment with its own province on one side and another province
on the other is a shared border. This recovered 1,526 province pairs. Lines of a pair
are then merged end to end, so a shared edge has one record and both neighbours get
the same simplified line at every level of detail.

### Coast and province seams

Province rings use a coarser coast than Natural Earth 1:10m in places. Rather than
editing them, the renderer draws land first, coloured through the nearest-province
raster, then province fills on top, both confined to the 1:10m land by the stencil
buffer. Fine-coast land outside the rings takes the right colour, fills cannot spill
past the coast, and a sliver between two provinces shows the correct colour underneath.

### Period corrections

Natural Earth is a modern dataset. The compiler removes what the 1900 scenario must
not show:

- 196 modern reservoirs are excluded. Thirteen features Natural Earth classes as
  reservoirs but which are natural lakes that existed in 1900 (Il'men, Zaysan, Mjøsa
  and others) are kept by an explicit list.
- The Aral Sea and Lake Chad use the Natural Earth historic-lake polygons instead of
  their modern remnants.

## 3. Runtime architecture

Everything lives in `packages/app/src/map/`. Module boundaries follow the separation
the map needs for future modes:

| Concern | Module |
|---|---|
| Projection | `projection.ts` |
| Camera mathematics | `camera.ts` (pure) |
| Geometry | `renderBundle.ts` (decoder, pure) |
| Political ownership | `mapModes.ts` `buildProvinceStates` (pure, from the snapshot) |
| Map-mode data | `mapModes.ts` `MapMode` (pure) |
| Colour | `politicalPalette.ts` (pure), `mapStyle.ts` (pure) |
| Picking | `hitTest.ts` (pure) |
| Label placement | `labels.ts` (pure) |
| Rendering | `glRenderer.ts` (WebGL2), `labelPainter.ts` (canvas) |
| Input, frame loop | `mapEngine.ts` (web, outside React) |
| Interface | `GlWorldMap.tsx` |

`components/WorldMap.tsx` is the single entry point. It selects the WebGL map on the web
when a hardware-accelerated WebGL2 context exists, and the SVG renderer otherwise. Native
builds always use SVG. Both share the projection, palette and catalogue.

### Why WebGL2

The former SVG map held about 1,800 live paths of 224,000 ring edges, drawn three times
for the seam and re-rendered through React on every hover. Canvas 2D would remove React
but still re-rasterise the geometry on each frame. WebGL2 needs no new runtime dependency
and lets the geometry be static.

The central idea is the **style table**, a small texture with one texel per province.
Fill colour and state flags are in row 0, hatching in row 1, and owner and unit group ids
in row 2. Border segments carry province indices, so the vertex shader classifies each
as internal, colonial or international by comparing group ids. Consequently:

- ownership changes redraw borders with no geometry work;
- a map mode is a table upload;
- hover and selection rewrite one texture row.

Outlines of the selected country, player and hovered province are collected into small
dynamic buffers when flags change, instead of being tested in the shader every frame.

### Multiscale behaviour

| Scale (px per unit) | Band | Behaviour |
|---|---|---|
| below 2.5 | World | Continents, country names, ocean names, graticule; province lines off |
| 2.5 to 7 | Strategic | Province lines fade in; colonial boundaries firm up |
| 7 to 20 | Provincial | Capitals, then province names; rivers at full strength |
| above 20 | Close | Relief recedes before its texels show; 1:10m coast at full detail |

Bands are in `mapStyle.ts`. Geometry level is chosen so simplification stays under about
0.6 device pixels. Line widths are in screen pixels at every zoom.

### Interaction

Drag to pan, with a brief throw; wheel, trackpad or pinch to zoom toward the pointer;
double-click to zoom in, shift for out; arrows, `+`, `-` and `0` on the keyboard. The
world wraps horizontally without limit. A press that travels under 4 pixels is a click.

Picking is a uniform grid over province bounding boxes with lazily decoded rings, using
the same even-odd rule as the fills, then the raster for fine-coast land. Tiny islands
have a 5 pixel tolerance. Mean pick cost is under 0.2 ms.

## 4. Adding a map mode

Add a `MapMode` to `MAP_MODES` in `mapModes.ts`:

```ts
const populationMode: MapMode = {
  id: "population",
  label: "Population",
  appearance: (index, context) => ({ fill: ramp(context.density[index]), stripe: null, dimmed: false }),
  legend: () => [...],
};
```

Extend `MapDataContext` with the values the mode reads, from the snapshot. Nothing in the
renderer changes. A mode must use real data: a province with no value takes `NO_DATA_FILL`.

## 5. Colour

`STATE_COLORS` is authored by tag. The great powers follow period atlas convention; a
dependent territory lifts its sovereign's colour toward parchment by status, so an empire
reads as one family. Colours depend only on the tag, so adding a polity changes no other
colour, and a tag with no entry derives a colour from its own hash.

`m15-map-style.test.ts` requires neighbouring polities of different realms to differ by
at least 0.04 in OKLab, and 0.022 under simulated deuteranopia (Machado et al., 2009).
Polities of one realm share a family deliberately and are separated by the boundary line.

## 6. Sources and licensing

All cartographic inputs are **Natural Earth, public domain**
(<https://www.naturalearthdata.com/about/terms-of-use/>). They are downloaded into the
ignored `.cache-map/` directory and verified against SHA-256 values in
`scripts/map/sources.mjs`. Vector layers are pinned to the `v5.1.2` repository tag.

| Layer | Source file |
|---|---|
| Land | `ne_10m_land` |
| Small islands | `ne_10m_minor_islands` |
| Lakes | `ne_10m_lakes` |
| Aral Sea, Lake Chad | `ne_10m_lakes_historic` |
| Rivers | `ne_10m_rivers_lake_centerlines` |
| Terrain | `SR_50M` shaded relief |
| Sea floor | `OB_50M` ocean bottom |

Build-only dependency: `earcut` 3.0.2 (ISC), root `devDependencies`. It does not ship in
the application. `jimp-compact` was already present. Sea names are an authored gazetteer
of usual English names; fonts are the existing system stacks.

## 7. Known limitations

- **Source precision.** Coasts are 1:10m and province boundaries about 0.02 degrees. At
  maximum zoom a boundary shows straight segments of several pixels. Some authored
  provinces are deliberately coarse, for example the Eupen-Malmedy and Hohenzollern
  polygons, and now read more plainly than they did.
- **Modern coast.** Natural Earth shows today's coastline, including reclaimed land such
  as the Dutch polders. Only lakes are period-corrected.
- **Coast slivers.** Fine-coast land beyond a province ring is coloured from a raster of
  about 10 km, so where two provinces meet at the sea the colour change can step slightly
  at very high zoom.
- **Labels.** One label per political unit, on its largest landmass, so an archipelago is
  named on one island. Labels avoid each other but not interface panels. Sea names use
  usual English forms, not period-specific ones such as "German Ocean".
- **Native.** iOS and Android use the SVG renderer. It shares the palette and projection
  but not the 1:10m coast, relief, or multiscale labels, and it has not been run on a device.
- **Software rendering.** Without hardware acceleration the application uses the SVG map,
  as software WebGL takes seconds per frame on this geometry.
- **Bundle size.** The map adds about 7.4 MB of static assets to the web build.
