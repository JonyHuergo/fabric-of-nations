/**
 * M11d provider lifecycle regression.
 *
 * Playtesting showed that finishing a save silently replaced the simulation
 * worker: `handleEvent` closed over `savedCampaign`, so the worker-creation
 * effect re-ran when the saved-campaign state changed, and the provider then
 * re-created the campaign from day 0. The repository has no React renderer in
 * the test environment, so this guard pins the structural invariants that make
 * the regression impossible: the worker lifecycle depends only on the explicit
 * restart epoch, and handlers are always reached through refs.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../app");

function providerSource(): string {
  return readFileSync(join(APP, "src/worker/SimulationProvider.tsx"), "utf8");
}

describe("M11d simulation provider lifecycle", () => {
  test("the worker is only replaced by an explicit restart epoch", () => {
    const source = providerSource();
    expect(source).toContain("}, [webEpoch]);");
    expect(source).toContain("}, [nativeEpoch]);");
    // Handler identity must not be an effect dependency.
    expect(source).not.toMatch(/\}, \[webEpoch, handleEvent/);
    expect(source).not.toMatch(/\}, \[nativeEpoch, handleEvent/);
    expect(source).toContain("onEvent: (event) => handleEventRef.current(event)");
  });

  test("the save envelope is read through a ref inside the event handler", () => {
    const source = providerSource();
    // D-114: the saved games replaced the single envelope, under the same rule.
    expect(source).toContain("savesRef.current.length === 0");
    expect(source).toContain("updateSaves([info.slot, ...savesRef.current");
    // The old dependency array that made a completed save rebuild the worker.
    expect(source).not.toContain("[savedCampaign, setRunningState]");
    expect(source).not.toContain("[saves, setRunningState]");
  });

  test("a fresh campaign is only recreated after a real worker replacement", () => {
    const source = providerSource();
    // Recreate guard must compare against the snapshot's own player identity.
    expect(source).toContain("snapshot.playerCountryId === desired");
    expect(source).toContain("activePlayerCountryIdRef.current");
  });

  test("a startup storage error survives the worker READY event", () => {
    const source = providerSource();
    expect(source).toContain("startupStorageErrorRef.current === null");
    expect(source).toContain("startupStorageErrorRef.current = message");
    // READY must not unconditionally clear the error banner.
    expect(source).not.toContain('if (event.type === "READY") setError(null);');
  });
});
