import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../app");

function source(path: string): string {
  return readFileSync(join(APP, path), "utf8");
}

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
