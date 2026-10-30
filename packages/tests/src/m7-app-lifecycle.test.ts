import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORLD_SCHEMA_VERSION } from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../app");

function source(path: string): string {
  return readFileSync(join(APP, path), "utf8");
}

describe("campaign startup and autosave wiring", () => {
  test("startup reads saved metadata and offers Continue or New Game", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    const app = source("App.tsx");
    expect(provider).toContain("readStoredCampaign");
    expect(provider).toContain('setStartup("menu")');
    expect(provider).toContain("resumeSavedGame");
    expect(provider).toContain("createGame");
    expect(app).toContain("MainMenuScreen");
    expect(app).toContain("CountrySelectionScreen");
    expect(app).toContain("onNewGame");
    expect(app).toContain("onContinue");
    expect(app).toContain("Replace the saved campaign?");
  });

  test("overwrite confirmation, autosave debounce, and failure feedback are present", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    expect(provider).toContain("overwritePrompt");
    expect(provider).toContain("confirmOverwrite");
    expect(provider).toContain("AutosaveScheduler");
    expect(provider).toContain("requestAutosave");
    expect(provider).toContain('kind === "autosave"');
    expect(provider).toContain('"Autosave failed"');
    expect(provider).toContain('"Autosaved"');
  });

  test("the storage adapter uses the current schema and replace-safe SaveStore", () => {
    const storage = source("src/storage/saveStorage.ts");
    expect(storage).toContain("SaveStore");
    expect(storage).toContain("readStoredCampaign");
    // The app cannot import simulation internals, so its schema literal must be
    // checked against the authoritative constant instead of pinning an old value.
    const match = /SUPPORTED_SAVE_SCHEMA_VERSION\s*=\s*(\d+)/.exec(storage);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(WORLD_SCHEMA_VERSION);
  });
});

/**
 * Source-level wiring guards for platform paths that cannot be exercised in the
 * Node test harness. These do not claim native-device behavior is verified; they
 * prevent the WebView/AppState/error-boundary hooks from being silently removed.
 */
describe("app lifecycle wiring", () => {
  test("native WebView process-failure callbacks route to the common error path", () => {
    const nativeHost = source("src/worker/NativeWorkerHost.tsx");
    expect(nativeHost).toContain("onRenderProcessGone");
    expect(nativeHost).toContain("onContentProcessDidTerminate");
    expect(nativeHost).toContain("onError(");
    expect(nativeHost).toContain("restart()");
    expect(nativeHost).toContain("key={reloadKey}");
  });

  test("provider pauses on backgrounding and resumes only through the lifecycle path", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    expect(provider).toContain("AppState.addEventListener");
    expect(provider).toContain("document.visibilityState");
    expect(provider).toContain("resumeOnVisibleRef");
    expect(provider).toContain("restartWorker");
    expect(provider).toContain("WorkerSupervisor");
    expect(provider).toContain('setSaveStatus(null)');
  });

  test("every worker event is sequenced through the supervisor", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    expect(provider).toContain("supervisor.receive(event)");
    expect(provider).not.toContain("handleEvent(event)");
  });

  test("player-facing copy does not retain obsolete milestone placeholders", () => {
    const status = source("src/index.ts");
    expect(status).toContain("playable-shell");
    expect(status).not.toContain("placeholder");
    expect(status).not.toContain("arrive in M7");
    const politics = source("src/screens/PoliticsScreen.tsx");
    expect(politics).not.toContain("depend on M9");
    const war = source("src/screens/WarScreen.tsx");
    expect(war).toContain("aged 18–45");
  });

  test("the app has a contained rendering-error fallback with retry", () => {
    const app = source("App.tsx");
    const boundary = source("src/components/AppErrorBoundary.tsx");
    expect(app).toContain("AppErrorBoundary");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("Retry rendering");
  });
});
