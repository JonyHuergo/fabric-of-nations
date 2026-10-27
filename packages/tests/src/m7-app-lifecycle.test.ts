import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    expect(provider).toContain('setStartup("choice")');
    expect(provider).toContain("resumeSavedGame");
    expect(provider).toContain("startNewGame");
    expect(app).toContain("CampaignChoiceScreen");
    expect(app).toContain("Continue");
    expect(app).toContain("New Game");
    expect(app).toContain("ConfirmDialog");
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
    expect(storage).toContain("SUPPORTED_SAVE_SCHEMA_VERSION = 17");
    expect(storage).toContain("readStoredCampaign");
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

  test("the app has a contained rendering-error fallback with retry", () => {
    const app = source("App.tsx");
    const boundary = source("src/components/AppErrorBoundary.tsx");
    expect(app).toContain("AppErrorBoundary");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("Retry rendering");
  });
});
