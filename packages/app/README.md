# @century/app

Century's M7 Expo / React Native playable shell.

## Screens

1. **Map** — stylized 4×4 vector-grid prototype of the 16 authored regions, with
   country colors and selection. The 500-region production map and pan/zoom are
   not implemented.
2. **Country** — population, working-age population, employment, literacy, wealth,
   militancy, hardship, treasury, debt, and fiscal policy.
3. **Budget** — treasury, income tax, welfare, latest net fiscal result, a compact
   net-fiscal history, and the `set-fiscal-policy` action.
4. **Population** — country population/employment aggregates and needs counters.
5. **Markets** — each authored market's goods, prices, and stock.
6. **Ledger** — immutable monthly country fiscal lines, world gross flows, and
   bounded diagnostics.

Controls: start/pause, step one day, speeds 1/2/5/10 simulated days per second,
save, and load. Actions are sent only through the versioned worker protocol.

## Architecture

- `packages/sim-worker` owns the authoritative world. The app imports only
  `@century/sim-worker` protocol, snapshot types, selectors, and the save-storage
  codec. It never imports `@century/sim` or `@century/data`.
- On web, the worker bundle runs in a Web Worker created from a Blob URL.
- On iOS/Android, the same bundle runs in a deliberately hidden
  `react-native-webview`; the WebView's JavaScript context is separate from the
  React Native UI thread. The app communicates via `injectJavaScript` and
  `ReactNativeWebView.postMessage`.
- The worker emits immutable, bounded snapshots. The UI holds no live world.
- Commands are applied only between completed ticks. Player actions use the same
  `validateCountryAction` / `applyCountryAction` path as the AI.
- Saves are the canonical simulation save string compressed with gzip and base64
  encoded at the platform-storage boundary; the canonical format is unchanged.

The browser worker bundle is generated into `src/generated/simWorker.ts`:

```bash
pnpm -F @century/app build:worker
```

Regenerate it after changing `packages/sim-worker`, `packages/sim`, or the
historical sample. The generated scenario is produced by
`packages/sim-worker/scripts/generate-scenario.mjs` after building
`@century/data`.

## Commands

```bash
pnpm -F @century/app typecheck
pnpm -F @century/app build:worker
pnpm -F @century/app web
pnpm -F @century/app export:web
pnpm -F @century/app export:ios
pnpm -F @century/app export:android
```

`expo export` produces JavaScript/Hermes bundles. A native release build requires
Xcode/Android SDK and a named reference device; neither was available in the M7
execution environment.

## Verified and unverified

Verified: web export, iOS/Android JS bundle export, headless Chromium Pixel 5
emulation with start/pause/step, fiscal-policy apply, gzip save/load restoring the
same day and policy, month-end ledger rendering, and zero page errors. The Node
worker-thread proof of concept and a simulated ReactNativeWebView bridge path also
pass.

Not verified: native iOS/Android release builds, real-device UI frame rate, cold
start, memory, battery, on-device tick p95, and the 500-region/pan-zoom production
map. These remain **NOT EVALUATED**.
