# M11e — Simulation dependency cycles and WorldMap SVG runtime errors

**Status:** implemented and verified.

**Code commit:** `4a5f62f` (`fix: eliminate simulation dependency cycles and WorldMap SVG errors`)

**Report commit:** the commit that adds this file (listed in the final answer).

## 1. Summary

Two independent defects were reproduced and fixed:

1. **Simulation runtime cycles.** Metro reported three `Require cycle` warnings
   from `packages/sim/dist`. The dependency graph actually contained one cyclic
   component of six modules (`world`, `economy/validation`, `economy/trade`,
   `economy/monetary`, `economy/military`, `economy/profit`). The cycle was broken
   at source by moving state construction, lookups and structural validation into
   lower-level modules that import `World` only as a type. The compiled runtime
   graph is now acyclic: **63 modules, 0 cyclic components**.
2. **Repeated WebShape/React DOM errors.** `react-native-svg`'s web `WebShape`
   converts `onPress`/`onPressIn` into React Native responder props and passes
   them to the DOM. React DOM logs an error for every unknown handler. This was
   reproduced in the Expo **development** bundle (the production export suppresses
   React's development warnings), then fixed with platform-specific selection
   props. The final development and exported builds report **zero console errors
   and zero warnings**.

All simulation behavior, determinism, serialization, save schema and map data
are unchanged.

## 2. Issue A — simulation dependency cycles

### 2.1 Observed warnings

The development bundle emitted these warnings on every load:

```text
Require cycle: ../sim/dist/world.js -> ../sim/dist/economy/validation.js -> ../sim/dist/economy/trade.js -> ../sim/dist/world.js

Require cycle: ../sim/dist/world.js -> ../sim/dist/economy/validation.js -> ../sim/dist/economy/trade.js -> ../sim/dist/economy/monetary.js -> ../sim/dist/world.js

Require cycle: ../sim/dist/world.js -> ../sim/dist/economy/military.js -> ../sim/dist/world.js
```

A full SCC analysis of `packages/sim/dist` found one cyclic component, not only
the three chains above:

```text
economy/military.js
economy/monetary.js
economy/profit.js
economy/trade.js
economy/validation.js
world.js
```

The additional path was `world -> economy/profit -> economy/validation ->
economy/trade -> ... -> world`.

### 2.2 Source files and imports responsible

| Import | Kind | Why it existed | Cycle role |
| --- | --- | --- | --- |
| `world.ts -> economy/validation.ts` (`assertValidEconomyState`) | runtime | Whole-world validation before tick/save | Starts the cycle |
| `economy/validation.ts -> economy/trade.ts` (`assertValidTradePolicyState`) | runtime | Validate per-country trade policy | Middle link |
| `economy/trade.ts -> world.ts` (`assertValidWorldForTick`) | runtime | Revalidate after staged trade phases | Back edge |
| `economy/trade.ts -> economy/monetary.ts` (`isConvertibilitySuspended`) | runtime | Trade FX check | Extends cycle 2 |
| `economy/monetary.ts -> world.ts` (`assertValidWorldForTick`) | runtime | Revalidate after monetary phase | Back edge |
| `economy/military.ts -> world.ts` (`assertValidWorld`) | runtime | Revalidate after military action/phase | Back edge |
| `world.ts -> economy/military.ts` (`emptyMilitaryState`, `assertValidMilitaryState`) | runtime | Initial state and validation | Starts cycle 3 |
| `world.ts -> economy/profit.ts` (`assertValidProfitDistributionPolicy`) | runtime | Validate policy | Hidden cycle through validation |
| `economy/profit.ts -> economy/validation.ts` | runtime | Finance/period validation | Hidden cycle middle link |
| `economy/validation.ts`, `economy/profit.ts` `World` imports | **type-only** | Type checking | Erased; not a runtime edge |
| `world.ts -> economy/types.ts` and low-level modules -> `world` | **type-only** | Shared contracts | Erased; intentional |

`trade.ts`, `monetary.ts` and `military.ts` genuinely needed a runtime
whole-world validator at the end of a public phase. `world.ts` genuinely needed
their validators. No partially initialized export was observed to throw during
tests or normal startup, but the cycles were real and Metro warned about them on
every development load; they are a latent initialization-order hazard.

### 2.3 Architectural correction

The validation hierarchy was inverted instead of hiding the warnings:

- **New lower-level modules** own state construction, stable lookups and
  structural validation:
  - `packages/sim/src/economy/tradeState.ts`
  - `packages/sim/src/economy/monetaryState.ts`
  - `packages/sim/src/economy/militaryState.ts`
- These modules import `World` with `import type` only. They never import
  `world.ts`, the world initializer, or the whole-world validator at runtime.
- `world.ts` and `economy/validation.ts` now import the low-level modules rather
  than the runtime phase modules.
- `trade.ts`, `monetary.ts` and `military.ts` keep their self-validation
  contracts by importing `assertValidWorld*` from `world.ts`; because `world.ts`
  no longer imports them, the runtime graph is acyclic.
- The phase modules **re-export** their moved state/validation symbols, so the
  public `@century/sim` API, scenario construction and existing tests are
  unchanged.
- Shared external-counterparty/monetary helpers (`accountBalanceSUSD`,
  `currencyValuationOf`, `parseCurrencyRate`) were extracted with their
  validators rather than duplicated.
- No logic was copied into a generic utility module.

Design rationale is recorded in `DECISIONS.md` as **D-101**.

### 2.4 Final dependency graph

```
simulation source (runtime imports): 63 modules, 0 cyclic component(s)
simulation dist (runtime imports):   63 modules, 0 cyclic component(s)
```

Type-only interface edges (for example `economy/*State.ts -> world.ts` for the
`World` type) still exist by design and are erased by TypeScript; they are not
runtime dependencies. The checker only follows emitted runtime imports.

A reusable check was added:

- `scripts/m11e/check-sim-dependencies.mjs`
- root script `pnpm run check:sim-deps`
- included in the root `ci` script after `check:worker`
- regression suite `packages/tests/src/m11e-simulation-dependencies.test.ts`

The checker validates both the TypeScript runtime graph (ignoring type-only
imports) and the generated JavaScript graph, and prints the member modules and
edges of every cyclic component.

## 3. Issue B — repeated WorldMap SVG errors

### 3.1 Full original messages

The production export suppresses React's development-only warnings, so the
defect was reproduced by launching the actual app through the Expo web
development server. The complete messages were:

```text
Unknown event handler property `onStartShouldSetResponder`. It will be ignored.
Unknown event handler property `onResponderTerminationRequest`. It will be ignored.
Unknown event handler property `onResponderGrant`. It will be ignored.
Unknown event handler property `onResponderMove`. It will be ignored.
Unknown event handler property `onResponderRelease`. It will be ignored.
Unknown event handler property `onResponderTerminate`. It will be ignored.
Unknown event handler property `onPressIn`. It will be ignored.
```

These are `console.error` entries, not thrown exceptions. The reported stack
originated at:

```text
react-native-svg/lib/module/web/WebShape.js:74
```

with the application frames:

```text
WorldMap.tsx:690   <Path> in the polity fill pass
WorldMap.tsx:682   polities.map(...)
MainMenuScreen.tsx:28
App.tsx:124
```

The line numbers correspond to the pre-M11e `WorldMap.tsx`; the same `<Path>`
fill pass exists in the fixed file.

### 3.2 Exact failing component and props

The failing elements were the interactive polity fills, and the same mechanism
affected small-state markers:

```tsx
<Path
  key={polity.tag}
  d={polity.path}
  fill={fillFor(polity)}
  fillRule="evenodd"
  stroke="none"
  onPress={() => onSelect(polity.tag)}
  onPressIn={() => setHoveredTag(polity.tag)}
  accessibilityLabel={polity.entry.name}
  opacity={...}
/>
```

```tsx
<Circle
  key={`marker-${polity.tag}`}
  cx={x}
  cy={y}
  r={...}
  fill={...}
  stroke={colors.mapBorder}
  strokeWidth={...}
  onPress={() => onSelect(polity.tag)}
/>
```

No custom `React.createElement`, dynamic component type, invalid tag, malformed
path or non-finite coordinate was involved. The geometry was valid for all 133
polities.

### 3.3 Root cause

`WebShape` calls `hasTouchableProperty(props)`. Any `onPress`, `onPressIn`,
`onPressOut` or `onLongPress` makes the shape attach `SvgTouchableMixin` and
`prepare()` adds:

```js
onStartShouldSetResponder
onResponderTerminationRequest
onResponderGrant
onResponderMove
onResponderRelease
onResponderTerminate
```

to the props passed to the DOM element, while `onPressIn` also remains in the
forwarded props. React DOM does not recognise React Native responder events on
an SVG node and logs an error for each. Every interactive polity therefore
triggered the same family of errors; React deduplicates by property name within
a render, which is why a small number of messages repeated across renders.

This is an application-level incompatibility in how the map used
`react-native-svg` on web, not a defect in the dependency. `node_modules` was not
modified.

### 3.4 Fix

`WorldMap` now supplies platform-specific selection props:

```tsx
const polityPressProps = (tag: string): object =>
  Platform.OS === "web"
    ? {
        onClickCapture: () => {
          if (suppressClickRef.current) return;
          onSelect(tag);
        },
      }
    : {
        onPress: () => onSelect(tag),
        onPressIn: () => setHoveredTag(tag),
      };
```

- **Web:** `onClickCapture` is an ordinary React DOM event and survives
  `WebShape.prepare` (unlike `onClick`, which `prepare` overwrites). It does not
  trigger the touchable mixin, so no responder props reach the DOM.
- **Native:** `onPress`/`onPressIn` remain, preserving native touch behavior.
- **Hover on web** remains the existing container `onPointerMove` hit test; the
  native-only `onPressIn` is not needed there.
- A map drag ends with a browser click; the pan responder now records movement
  and briefly suppresses that click so panning does not select a country.
- Country selection, marker selection, highlighting, zoom and panning were all
  re-tested in the browser.

### 3.5 Geometry validation and renderer hardening

Projection, ring decoding, path building and validation were extracted to the
pure `packages/app/src/components/worldMapGeometry.ts` (no React Native/DOM
dependency):

- all coordinates are checked with `Number.isFinite`;
- odd coordinate counts are rejected;
- rings with fewer than three points are rejected;
- missing/empty rings and non-array values are rejected with tagged errors;
- malformed geometry is **not** silently skipped or repaired;
- a polity with no rings at all returns `path: null` and is rendered by the
  documented marker fallback instead of being discarded;
- projected coordinates and path strings are asserted finite.

The 1900 data itself contains no malformed ring: all 133 polities decode to
finite paths. Germany (`DEU`), Ottoman Libya (`OTT`), Wadai (`WAD`) and Darfur
(`DAR`) were explicitly checked and rendered.

### 3.6 Regression tests

- `packages/tests/src/m11e-worldmap-geometry.test.ts`
  - all 133 polity geometries decode;
  - every projected coordinate is finite and every path is non-empty;
  - the complete SVG plan is 267 paths (133 fills + 133 borders + 1 land mask)
    and 17 small-state markers;
  - odd-length, too-short, non-finite and non-array rings throw explicit errors;
  - empty rings produce the intentional marker fallback;
  - Germany, Ottoman Libya, Wadai and Darfur are present and finite;
  - the renderer uses static `Path`/`Circle` components and platform-safe
    selection props, with no `React.createElement`.
- `packages/tests/src/m11d-map-selection.test.ts` updated to pin the
  platform-specific helper and the absence of the old raw `onPress` in SVG
  shapes.
- `scripts/m11e/verify-web-console.mjs` launches the exported build and fails on
  any console error/warning, exception, rejection, worker error, failed request
  or missing map geometry.

Design rationale is recorded in `DECISIONS.md` as **D-102**.

## 4. Runtime verification

### 4.1 Browser and builds

- Headless Chrome **156.0.8078.74** on Windows 10.0.26200.
- Node **24.22.1**, pnpm **9.15.9**.
- Exported web build: `packages/app/dist-web`, bundle
  `index-c91c021c414f4f4b5ccd8367aef4f767.js` (4.9 MB).
- Development bundle (Expo Metro, port 8082) used only to reproduce and verify
  the React development warnings.
- M11d playtest harness: `scripts/m11d/lib/harness.mjs`.

### 4.2 Results

| Check | Result |
| --- | --- |
| Main menu loads | PASS |
| WorldMap renders | PASS — 1 SVG, 267 paths, 17 marker circles |
| Polity geometries processed | **133 / 133** |
| Country selection (map click) | PASS — Germany, Ottoman Libya, British India |
| Zoom (buttons, wheel, max scale) | PASS |
| Panning and reset | PASS |
| Hover highlighting / tooltip | PASS — Europe, Africa, South America, Central Asia |
| Layer switching (political/control/markets) | PASS |
| Campaign initialization | PASS — Austria-Hungary, United States, San Marino |
| Simulation advancement | PASS — stepping, running, pause, speed changes |
| Save / load | PASS — save, continue, date preserved, repeated save |
| Worker restart | PASS — no worker replacement during normal play |
| Persistence errors | PASS — legacy schema, corrupt save, missing save |
| Stress / responsive | PASS — 42 tab switches, 30× run, save/load cycles, narrow layout |
| M11d playtest scenarios | **268 PASS, 0 FAIL** |
| Console errors | **0** |
| Console warnings | **0** |
| Unhandled promise rejections | **0** |
| Runtime exceptions | **0** |
| Worker crashes / worker errors | **0** |
| Failed network requests | **0** |
| Workers used | 1 |

The only console entry in the development run was React's expected
“Download the React DevTools…” informational message. It is not an error and was
not treated as one.

Before the fix, the same development run reported the three require cycles and
the seven `Unknown event handler property` errors above. After the fix the same
run reported neither.

## 5. Validation commands

All commands were executed in `C:\vibe-games\century`.

| Command | Result |
| --- | --- |
| `pnpm test` | **PASS** — 90 suites, 908 tests, 0 failures (951 s) |
| `pnpm typecheck` | **PASS** — sim, data, sim-worker, app, bench, tests |
| `pnpm lint` | **PASS** — 223 TypeScript files, 63 in `packages/sim` |
| `pnpm run check:worker` | **PASS** — scenario and worker bundle current |
| `pnpm flags:check` | **PASS** — 66 flags, 133 polities, 723,273 bytes |
| `pnpm flags:audit` | **PASS** — 66 files, licence audit passed |
| `pnpm run check:sim-deps` | **PASS** — source 63/0 cycles, dist 63/0 cycles |
| `pnpm -F @century/app export:web` | **PASS** — exported to `dist-web` |
| `node scripts/m11e/verify-web-console.mjs` | **PASS** — all counters zero; 267 paths, 17 circles |
| `node scripts/m11d/playtest.mjs --fresh` | **PASS** — 268/268 scenarios, 0 console warnings/errors |

The first full `pnpm test` run had one infrastructure failure:
`worker-bundle-drift.test.ts` correctly detected that
`packages/app/src/generated/simWorker.ts` was stale after the simulation rebuild.
The worker bundle was regenerated with `pnpm -F @century/app build:worker`; the
subsequent full run passed all 908 tests. No test was deleted, skipped or
weakened.

## 6. Compatibility and invariants

- **Determinism:** `determinism.test.ts` and the known-answer tests pass; no RNG,
  seed, ordering or tick change.
- **Serialization/saves:** state shapes and schema are unchanged; save/load
  playtests pass, including legacy-schema and corrupt-save cases.
- **Simulation isolation:** `packages/sim` remains ES2022-only, with no DOM,
  React Native or platform imports; the boundary check passes.
- **No economic behavior change:** functions were moved verbatim; only import
  direction changed. No coefficient, formula or ordering changed.
- **Map data:** no historical geometry was changed; all 133 polities and the land
  mask still render.
- **Native compatibility:** native still uses `onPress`/`onPressIn`; only the web
  branch uses `onClickCapture`.

## 7. Files

Created:

- `packages/sim/src/economy/tradeState.ts`
- `packages/sim/src/economy/monetaryState.ts`
- `packages/sim/src/economy/militaryState.ts`
- `packages/app/src/components/worldMapGeometry.ts`
- `packages/tests/src/m11e-simulation-dependencies.test.ts`
- `packages/tests/src/m11e-worldmap-geometry.test.ts`
- `scripts/m11e/check-sim-dependencies.mjs`
- `scripts/m11e/verify-web-console.mjs`
- `docs/M11E_RUNTIME_ERRORS_REPORT.md`

Modified:

- `packages/sim/src/world.ts`
- `packages/sim/src/economy/validation.ts`
- `packages/sim/src/economy/trade.ts`
- `packages/sim/src/economy/monetary.ts`
- `packages/sim/src/economy/military.ts`
- `packages/app/src/components/WorldMap.tsx`
- `packages/app/src/generated/simWorker.ts` (regenerated, not hand-edited)
- `packages/tests/src/m11d-map-selection.test.ts`
- `package.json` (`check:sim-deps`, `ci`)
- `DECISIONS.md` (D-101, D-102)

## 8. Known limitations

- The development-mode reproduction requires `expo start --web`; the production
  export intentionally suppresses React development warnings. The regression
  suites therefore combine source/runtime contract assertions with the real
  browser playtest.
- Historically reconstructed territories remain approximations as documented in
  `docs/HISTORICAL_MAP_PROVENANCE.md`; this milestone changed none of their
  geometry.
- No new dependency was added.




## 9. Repository state

- Code commit: `4a5f62f` — `fix: eliminate simulation dependency cycles and WorldMap SVG errors`
- Report commit: the current `HEAD` commit that adds this file (hash reported in the final answer).
- Working tree: clean after the report commit (`git status --short` is empty).
- No `dist` file was edited by hand; `packages/sim/dist` and
  `packages/app/src/generated/simWorker.ts` were regenerated from source.
