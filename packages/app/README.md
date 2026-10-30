# @century/app

Century's M7 Expo / React Native playable shell, updated for E1 economic clarity.

## Screens

1. **Overview** (default) — player/AI identity, population/working-age/employment/
   hardship, treasury/debt, evidence-based problems, estimated production capacity,
   essential-goods stock/prices/capacity, latest closed month, and drill-down guidance.
2. **Map** — stylized 4×4 vector-grid prototype of the 16 authored regions, with
   country colors, player marker, selection, and a compact current summary. The
   500-region production map and pan/zoom are not implemented.
3. **Budget** — treasury, income tax, welfare, latest result, compact net-fiscal history,
   the `set-fiscal-policy` action, and a pure pre-commitment preview (current estimated
   wage base, tax/welfare deltas, constraints).
4. **Population** — country population/employment aggregates, household cash, estimated
   daily wage base, and needs counters. Working-age minus employed is explicitly not an
   unemployment rate.
5. **Markets** — each authored market's goods, prices, stock, and estimated daily
   production capacity; essential goods are marked.
6. **Ledger** — immutable monthly country fiscal flows and close balances, monthly
   economic report, annual accounting reports (flows, year-end balances, partial-year
   labels, correction counts), confirmed session action history, world gross flows, and
   bounded diagnostics.

Controls: start/pause, step one day, speeds 1/3/10/30 simulated days per second,
save, and load. Actions are sent only through the versioned worker protocol. Action
history is appended only from authoritative `ACTION_RESULT` replies and is bounded to
48 session entries; it is cleared on load or worker restart.

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
