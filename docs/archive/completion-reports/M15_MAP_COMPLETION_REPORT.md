# M15 completion report — world map overhaul

Decision record: D-111. Architecture, sources and limitations: `docs/MAP_RENDERING.md`.

## 1. Problems found in the original map

| Area | Finding |
|---|---|
| Geography | Coasts stopped at Natural Earth 1:50m. Lakes were not cut out, so the Great Lakes, Lake Victoria and the Aral Sea did not exist. Antarctica sat on the same plane as the political map. |
| Rendering | About 1,800 live SVG paths over 224,553 ring edges, each drawn three times for the seam, re-rendered through React on every hover. |
| Performance | 90 hover moves took 18.5 s (p95 frame 417 ms, 52 long tasks); panning stalled for up to 350 ms. |
| Borders | 117,141 of 170,721 unique province edges had no exact partner, because provinces were simplified independently. The last commits had fallen back to static polity outlines. |
| Colour | Sixteen colours by tag hash. Neighbours such as the Netherlands and Germany collided, and sea and land were nearly the same dark tone. |
| Layout | The map sat letterboxed in a panel with a hard-coded 600 px height, and half the screen was unused. |
| Selection | Clicking a colony selected its sovereign: British India opened the United Kingdom. |

## 2. What changed

**Geometry.** A new compiler, `scripts/map/build-render-bundle.mjs`, produces display geometry
from the authoritative data without changing it: Natural Earth 1:10m land and lakes, three
levels of detail, classified border and coast lines, rivers, and a nearest-province raster.
1,526 shared province pairs were recovered from unmatched edges. Modern reservoirs are
removed, and the Aral Sea and Lake Chad use their historic extents.

**Projection.** Gall stereographic replaces Miller, in one shared module used by both
renderers. At 50N the shape stretch falls from 1.19 to 1.06.

**Renderer.** WebGL2 on the web. A one-texel-per-province style table means ownership
changes, map modes, hover and selection never touch geometry; border class is computed in
the vertex shader from the two provinces a segment separates. The SVG renderer remains for
native builds and browsers without hardware WebGL2.

**Cartography.** Bathymetric sea from the ocean-bottom raster, restrained relief that fades
before its texels show, graticule, authored palette in empire families, soft hand-tinted
border wash, and a five-tier line hierarchy with screen-constant widths.

**Multiscale.** Province lines, capitals, province names and rivers enter by zoom band;
relief and graticule recede. The map holds 1,689 provinces at every scale.

**Labels.** Country names lie along the principal axis of their landmass in spaced serif,
sized to fit, and slide into the visible part of a country. Moments are additive, so labels
follow ownership. Also sea gazetteer, capitals and province names, with collision culling.

**Interaction.** Pointer-anchored smooth zoom, drag with a short throw, pinch, double-click,
keyboard, endless horizontal wrap, click versus drag threshold, fly-to on list selection,
hover card, and a 5 px pick tolerance for tiny islands.

**Interface.** The map takes the whole stage, with mode controls, legend and zoom controls
over it and a collapsible details dock.

**Future modes.** A mode is one `MapMode` value in `mapModes.ts`. Political, control and
markets use it today; no gameplay values were invented.

## 3. Datasets and assets

All cartographic inputs are Natural Earth, **public domain**, pinned by SHA-256 in
`scripts/map/sources.mjs`, vector layers at tag `v5.1.2`: 1:10m land, minor islands, lakes,
historic lakes, rivers; 1:50m shaded relief and ocean bottom. Generated output is in
`packages/app/public/map/` (7.4 MB). `earcut` 3.0.2 (ISC) is a build-only root dev
dependency. No fonts were added.

## 4. Architectural decisions

See D-111. In brief: display geometry is separate from authoritative geometry; 1:10m land
defines the coast through the stencil buffer, avoiding a global polygon overlay; WebGL2 with
SVG fallback; style table as the single point of change; shaders classify borders from
province pairs; same-origin static assets, keeping D-092's no-remote-services rule; clicks
now select the political unit; software rasterisers count as unsupported.

## 5. Validation actually run

| Command | Result |
|---|---|
| `pnpm lint` | Passed: 259 TypeScript files, 66 in `packages/sim` |
| `pnpm audit:branding` | Passed |
| `pnpm audit:monetary` | Passed |
| `pnpm typecheck` | Passed in all packages |
| `pnpm map:check` | Passed: bundle rebuilt byte-identically from pinned sources |
| `pnpm -F @century/app export:web` | Passed |
| `pnpm test` | Passed: 102 suites, 1,169 tests |
| `pnpm run check:worker`, `check:sim-deps` | Passed: worker bundle current, no cyclic simulation imports |
| `pnpm -F @century/app export:ios`, `export:android` | Passed (bundling only) |
| `PLAYTEST_GPU=1 pnpm map:verify` | 24 of 24 checks passed in real Chrome |
| `PLAYTEST_GPU=1 pnpm map:measure` | See measurements below |
| `pnpm map:measure` (SwiftShader) | Application selected SVG; ran with no page errors |

The full suite began before the last renderer, palette and label fixes, some of which landed
while it ran. The map, UI wiring, branding, monetary and M12 suites were therefore re-run on
the final code and passed.

Not run: `pnpm bench`, because this work changed nothing in `packages/sim` or the tick
pipeline. iOS and Android bundles were exported but not run on a device.

`pnpm map:verify` covers: main menu, country selection by map and by list, hit tests
(Paris, Bavaria, Sicily, Tasmania, Honshu, Chukotka across the antimeridian, open Atlantic),
zoom independence, click selects, drag pans without selecting, sub-threshold jitter stays a
click, cursor anchoring, screen-to-geography round trip, antimeridian wrap, resize, hover
card, map modes, dock, narrow layout, remount, and no page errors or rejections.

New tests: `m15-map-bundle`, `m15-map-camera`, `m15-map-hit-test`, `m15-map-style`,
`m15-map-labels`.

Defects found and fixed during validation, each now covered by a regression test:

- Even-odd rings flagged as holes but inside no outer ring were dropped, losing islets.
- Labels fitted exactly to a clipped baseline failed their own on-screen test by a rounding
  error, which removed the United States at world zoom.
- Global coverage provinces dragged the French Pacific's name onto southern Africa.
- Austria-Hungary and Romania were nearly the same yellow, and four other neighbouring
  pairs were too close, including under simulated deuteranopia.

One existing test changed: `m11c1-map-viewport` hard-coded the former 1000×500 map shape. Its
assertions are unchanged and now use `MAP_HEIGHT`.

### Measurements

Chrome headless at 1600×900, GeForce GTX 750 Ti (Direct3D 11), scripted trusted input. The
baseline is the previous build on SwiftShader and software raster, so the comparison is
indicative, not like for like. On software the application now also picks SVG, whose figures
are in the last column.

| Metric | Before (SVG, software) | After (WebGL, GPU) | SVG fallback (software) |
|---|---|---|---|
| Hover: 90 moves, wall time | 18.5 s | 1.5 s | 10.1 s |
| Hover: p95 frame | 417 ms | 16.8 ms | 483 ms |
| Hover: long tasks | 52 | 0 | 17 |
| Pan: p95 frame | 350 ms | 16.8 ms | 417 ms |
| Pan: long tasks | 21 | 0 | 11 |
| Zoom: 18 wheel steps, wall time | 6.4 s | 1.5 s | 7.7 s |
| Mean pick | not measured | 0.18 ms | not measured |
| CPU per frame, p50 / p95 | not measured | 3.2 / 16 ms | not measured |

## 6. Known limitations

- **Native is not upgraded.** iOS and Android keep the SVG renderer with the new palette and
  projection, but not the 1:10m coast, relief or new labels.
- **No GPU, no WebGL map.** Those machines get the SVG map, and `pnpm map:verify` cannot run
  in GPU-less CI, so the WebGL path needs a manual run.
- **Source precision shows at maximum zoom.** Province boundaries are about 0.02 degrees, and
  some authored polygons are coarse (Eupen-Malmedy, Hohenzollern).
- **The coast is modern.** Reclaimed land such as the Dutch polders is present; only lakes
  are period-corrected.
- **Labels:** one per political unit, on its largest landmass; they avoid each other but not
  interface panels, so a name can pass beneath the mode bar.
- **Sea names** are usual English forms from an authored gazetteer, not period-specific ones.
- **Crossing the narrow breakpoint** remounts the map and resets its camera.
- **Download size:** 7.4 MB of map assets is added to the web build.
- Before-and-after zoom pairs are approximate. The previous build was replaced before a full
  set of comparable zooms was captured, so "before" zooms use earlier milestone screenshots.

## 7. Most important files

Created: `scripts/map/build-render-bundle.mjs`, `scripts/map/sources.mjs`,
`scripts/map/raster-lib.mjs`, `scripts/map/measure-map.mjs`, `scripts/map/verify-map.mjs`,
`packages/app/src/map/*` (`GlWorldMap.tsx`, `mapEngine.ts`, `glRenderer.ts`, `renderBundle.ts`,
`hitTest.ts`, `camera.ts`, `projection.ts`, `mapModes.ts`, `politicalPalette.ts`, `mapStyle.ts`,
`labels.ts`, `unitLabels.ts`, `labelPainter.ts`, `statusLabel.ts`),
`packages/app/public/map/*`, `packages/data/data/map/map_render_audit.json`,
`docs/MAP_RENDERING.md`, `packages/tests/src/m15-map-*.test.ts`.

Modified: `packages/app/src/components/WorldMap.tsx`, `worldMapGeometry.ts`, `mapViewport.ts`,
`packages/app/src/screens/GameShell.tsx`, `MainMenuScreen.tsx`,
`scripts/m11d/lib/harness.mjs`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `DECISIONS.md`,
`Fabric_of_Nations_GDD.md` (one projection line), `docs/MAP_DATA.md`, `README.md`,
`packages/app/README.md`, `packages/tests/src/m11c1-map-viewport.test.ts`.

## 8. Screenshots

In `docs/images/map/`. Before: `before-initial.png` (1600×900), and the earlier
`docs/images/m12e-oceania-global.png`, `docs/images/m12a-game-map-zoom.png`. After:
`after-initial`, `after-world`, `after-europe`, `after-balkans`, `after-low-countries`,
`after-south-germany`, `after-great-lakes`, `after-africa`, `after-antimeridian`,
`after-hover-and-selection`, `after-country-selection`, `after-main-menu`,
`after-mode-markets`, `after-narrow`, and `svg-fallback-initial`.
