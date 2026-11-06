# M16 completion report: The Living Atlas, on every device

Decision record: D-112. Map architecture: `docs/MAP_RENDERING.md`. Fonts:
`docs/FONT_PROVENANCE.md`. Nothing is committed.

## 1. What changed

**One map on every platform.** The WebGL engine now runs in one self-contained page,
`packages/app/public/map/atlas-v1.html` (8.7 MiB). iOS and Android load it in a WebView from the
app's packaged assets, and the web build loads the same file in an iframe. Web development
therefore exercises the artifact a phone receives. Gestures and the camera stay in the page, and
the bridge carries only theme, lens, ownership changes, selection, insets and presses. The map is
mounted once under every screen, so menus and sheets slide over it.

**Phone-sized assets.** Rasters drop from 4096 to 2048 texels and upload as one channel. The
bundle decodes in a worker, and an idle map draws no frames. A source map of the iOS bundle shows
no province rings and no render code in the JavaScript.

**The design.**

- Four era themes from one token module, chosen from the date, with a 1.6 second cross-fade.
- 258 authored polity colours: the 21 specified, the rest in the same matte band.
- Paper-coloured borders, an accent selection outline and quieter relief.
- Condensed capital labels at 11 pt or larger, with about 25 on a phone screen.
- Three zoom levels: world, nation and province.
- Newsreader and IBM Plex Sans Condensed bundled for every platform.

**The interface.** The sidebar and large top bar are gone. The layout follows the brief: pill,
read-only date and numbers, dispatch strip, four domain buttons, lens switch, time control, and a
right sheet of about 300 points. All 13 screens are in their domains, each opening with a headline
number, then a trend where real history exists, then detail. Long lists fold. The Technology sheet
fell from 11,769 to 1,480 points of scrolling, with every control kept. Main menu, briefing,
country selection, save and load, errors and loading all match.

**Touch.** Tap, long-press loupe, drag, pinch and double-tap, 18 points of tolerance around tiny
places, and 44-point controls throughout. A selection on the map leaves the camera alone because
the map surface slides aside instead; a selection from a list flies to the place.

**Dispatches.** Told in the era's medium, from changes between snapshots only: wars, peace offers,
transfers, occupation, the player's research, construction and monthly close.

## 2. Files

**Created.**

- `packages/app/src/design/`: `tokens.ts`, `useEraTheme.ts`, `fontAssets.ts`.
- `packages/app/src/map/bridge/protocol.ts`, `map/lenses.ts`, `map/runtimeCatalog.ts`.
- `packages/app/src/map/host/`: `AtlasMap.tsx`, `AtlasSurface.tsx`, `AtlasSurface.native.tsx`,
  `MapStage.tsx`, `atlasAsset.ts`, `mapHostState.ts`.
- `packages/app/src/map/runtime/`: `main.ts`, `decodeBundle.ts`, `decodeWorker.ts`.
- `packages/app/src/screens/`: `navigation.ts`, `dispatches.ts`.
- `packages/app/src/components/`: `EntryPanel.tsx`, `icons.tsx`, `provinceGeometry.ts`,
  `provinceGeometry.native.ts`.
- `packages/app/assets/fonts/`, `packages/app/public/map/atlas-v1.html`,
  `packages/app/src/generated/provinceCatalog.ts`.
- `scripts/map/`: `build-atlas.mjs`, `verify-file-origin.mjs`, `audit-sheets.mjs`.
- `packages/tests/src/`: `m16-design-tokens.test.ts`, `m16-mobile-shell.test.ts`.
- `docs/FONT_PROVENANCE.md`, `docs/images/living-atlas/`.

**Removed.** `packages/app/src/map/GlWorldMap.tsx`, and `screens/MapScreen.tsx`, which nothing
imported.

**Modified.**

- `App.tsx`, `theme.ts`, `GameShell.tsx`, every screen, `ui.tsx`, `Slider.tsx`, `WorldMap.tsx`,
  `CountryFlag.tsx`, `AppErrorBoundary.tsx`.
- `map/` engine, renderer, labels, painter, picking, modes, palette, style, `renderBundle.ts`.
- `app.json`, `metro.config.js`, `public/index.html`, `manifest.webmanifest`.
- `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`.
- `AGENTS.md`, `DECISIONS.md`, `README.md`, `packages/app/README.md`, `docs/MAP_RENDERING.md`,
  one superseded paragraph of the GDD.
- `scripts/map/verify-map.mjs`, `measure-map.mjs`, both terminology audits.

## 3. Decisions

D-112 holds the full record, and it supersedes D-111's native SVG decision. The ones most worth a
second look:

- **One file with everything inline** rather than separate assets read over `file://`. It costs
  about a third more for the bundle, and it removes every file-access setting from the WebView.
- **The SVG renderer stays as a fallback.** On native it draws polities only, because province
  rings left the phone's bundle. That saves about 5 MB on the normal path at the cost of province
  picking on a rare emergency path.
- **The map surface slides, the camera does not,** which satisfies both "the map shifts aside" and
  "a selection on the map must not move the camera".
- **Colonies lift 14% toward paper,** down from 24%. At 24%, British and Italian East Africa failed
  the deuteranopia threshold. The thresholds themselves were not touched.

## 4. Dependencies and licences

| Dependency | Version | Licence | Why |
|---|---|---|---|
| `expo-font` | ~58.0.10 | MIT | Loads the bundled faces |
| `expo-asset` | ~58.0.18 | MIT | Turns the packaged page into a file a WebView can load |
| `react-native-safe-area-context` | ~5.10.1 | MIT | Safe areas in landscape, on both platforms |
| Newsreader | Google Fonts build | OFL-1.1 | Names and headlines |
| IBM Plex Sans Condensed | Google Fonts build | OFL-1.1 | Labels and numbers |

All three packages are at the versions Expo SDK 58 pins in `bundledNativeModules.json`. The fonts
were copied in as files, so their npm packages are not dependencies.

## 5. Commands and results

All on the finished code unless noted.

| Command | Result |
|---|---|
| `pnpm lint` | Passed: 278 TypeScript files, 66 in `packages/sim` |
| `pnpm audit:branding` | Passed: 467 files scanned |
| `pnpm audit:monetary` | Passed: 465 files scanned |
| `pnpm run check:worker` | Passed: worker bundle current |
| `pnpm run check:sim-deps` | Passed: 66 modules, no cycles |
| `pnpm map:atlas:check` | Passed: page reproduces byte for byte, 9,143,095 bytes |
| `pnpm typecheck` | Passed in all packages |
| `pnpm test` | Passed: 104 suites, 1,267 tests |
| `pnpm run app:export` | Passed: web 13 MB; iOS and Android 8.8 MB Hermes bundles, atlas page included as an asset |
| `PLAYTEST_GPU=1 node scripts/map/verify-map.mjs` | Passed: 47 of 47, real Chrome with a GPU and CDP touch input |
| `PLAYTEST_GPU=1 node scripts/map/verify-file-origin.mjs` | Passed: 13 of 13, page at a `file://` address with a native-bridge shim |
| `PLAYTEST_GPU=1 node scripts/map/audit-sheets.mjs` | Passed: all 13 sheets at 667 × 375 and 844 × 390, nothing off the sheet, no control under 44 points |
| `node scripts/map/verify-map.mjs --fallback` | Passed: 3 of 3, SVG path on a software rasteriser |

The last live run found and fixed one real defect. The monthly dispatch and the campaign sheet's
"Last month" read a summary field that stays null for recent months, so neither ever appeared. Both
now read the player's closed months, and `m16-mobile-shell.test.ts` holds a regression test.

Two audits and one test changed in ways that deserve a note:

- Both terminology audits now blank runs of 1,000 or more base64 characters, after "SUSD" occurred
  by chance in the page's data. The page's code and catalogue text are still scanned.
- The branding audit's pinned theme colour moved from `#0b1014` to `#0d1419`.
- Four `e1-ui-wiring` assertions changed: navigation now lives in `navigation.ts`, and "map-first"
  now means no sheet is open at start, because the map stopped being a tab. No older
  `WorldMap.tsx` source-text test needed changing.

`pnpm map:check` was not run because the render bundle did not change. `pnpm bench` was not run
because `packages/sim` and `packages/sim-worker` are untouched.

## 6. Screenshots

`docs/images/living-atlas/` holds 44 screenshots:

- **Sizes:** main menu, country selection, game and sheet at 667 × 375, 844 × 390, 932 × 430,
  1180 × 820 and 1600 × 900.
- **Map:** all three zoom levels, all four eras, the control and market lenses, and the loupe.
- **Interface:** all four domains, the place sheet, campaign sheet, dispatch and briefing.
- **Fallback:** SVG main menu and country selection.

A sample covering each size range and most states was inspected by eye, not all 44.

## 7. Not verified

- **Devices.** The designer reports that the game runs on their mobile device. Everything automated
  ran in desktop Chrome with emulated touch. No frame-rate, memory, battery or thermal figures
  exist, and which of iOS and Android was tried is not recorded here.
- **The era cross-fade in play.** It was proved on the page and from unit tests, but no campaign was
  played across a real era boundary. Era screenshots use a web-only `?era=` display switch.
- **Dispatches for war, peace, transfers, occupation, research and construction** are covered by
  unit tests only. Only the monthly close was seen live, because the others did not occur in a
  short run.

## 8. Known limitations

- **`latestNetFiscalResultRUSD` is null in country summaries for recent months.** It is filled only
  when a period is compacted. The interface now reads the player's own history, but the worker field
  is still wrong and was left alone as outside this work.
- **Hardship read 100.0% for Germany** in every run that reached February 1900, up from 0.0% on
  day 0. `packages/sim` is unchanged, so this work did not cause it, but it is worth a look.
- **Speed.** At the 30× setting the run achieved about 2.5 days per second on this PC. It was not
  compared with the previous interface, so whether this work affected it is unknown. At that rate a
  full campaign would take about four hours.
- **No dispatches for** elections, treaties, disasters or history at large: the simulation has no
  event source for them.
- **Label contrast** is at least 2.1:1 on the fills, helped by a thin shadow, which is below the 3:1
  usual for large text. The specified matte fills set this range.
- **SVG fallback:** no relief, polities only on native, and coarser label sizing, so a long name
  such as UNITED STATES can overrun its country.
- **Labels can pass under the dispatch strip** while it shows, for six seconds.
- **Older systems** without `DecompressionStream` (iOS before 16.4) and emulators using software
  graphics take the fallback.
- **Android 16 large screens** may ignore the landscape lock under the platform's own rules.
- **Older playtest scripts** in `scripts/m11d` still assume the previous interface.

## 9. Running on a phone

Use a real device. On the same Wi-Fi as the PC, install Expo Go, then run this and scan the QR code:

```bash
pnpm -F @century/app start
```

For an installed build on Android, with USB debugging on:

```bash
pnpm -F @century/app exec expo run:android --device
```

For an installed build on iPhone, on a Mac with Xcode:

```bash
pnpm -F @century/app exec expo run:ios --device
```

After changing tokens or anything in `packages/app/src/map`, run `pnpm map:atlas` first. If the map
shows flat colours with no province lines, it has fallen back to SVG.
