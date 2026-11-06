/**
 * Source-level wiring of the app shell to the snapshot/command contract.
 * Merged in D-145 from the E1 UI wiring, M7 app lifecycle, M11d provider lifecycle
 * and M11d slider accessibility tests; each keeps its section.
 */
/**
 * E1 UI wiring guard.
 *
 * These are source-level integration checks: the repository has no React Native
 * renderer in the test environment, so the tests verify that the economic clarity
 * surfaces are wired to the pure snapshot/action contracts rather than carrying
 * their own simulation logic.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORLD_SCHEMA_VERSION } from "@century/sim";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../../app");

function source(relativePath: string): string {
  return readFileSync(join(APP, relativePath), "utf8");
}

describe("E1 UI wiring", () => {
  test("the M11 shell is map-first and the overview uses the explanation selector", () => {
    // M16: the map stopped being a tab. It is mounted once under every screen, and
    // the shell opens with no sheet over it, which is what map-first now means.
    const navigation = source("src/screens/navigation.ts");
    expect(navigation).toMatch(/id: "world",\s+label: "World"/);
    expect(navigation).toMatch(/id: "overview", label: "Overview"/);
    expect(source("src/screens/GameShell.tsx")).toMatch(/useState<SheetState \| null>\(null\)/);
    expect(source("src/map/host/MapStage.tsx")).toContain("<WorldMap");

    const overview = source("src/screens/CountryScreen.tsx");
    expect(overview).toContain("buildEconomicExplanations");
    expect(overview).toContain("Economic overview");
    expect(overview).toContain("Production capacity by good");
    expect(overview).toContain("Essential goods now");
    expect(overview).toContain("not an unemployment rate");
    expect(overview).toContain("estimated capacity");
  });

  test("the budget screen previews policy effects without simulating them", () => {
    const budget = source("src/screens/BudgetScreen.tsx");
    expect(budget).toContain("previewFiscalPolicy");
    expect(budget).toContain("Before you commit");
    expect(budget).toContain("Static current-base estimates");
    expect(budget).toContain("Estimated net monthly fiscal change");
    expect(budget).toContain("not forecasts");
    // E2 exposes the implemented instruments, each through the shared action path.
    expect(budget).toContain("Business-profit tax");
    expect(budget).toContain("Income-tax exemption");
    expect(budget).toContain("Treasury reserve target");
    expect(budget).toContain("previewDebtIssuance");
    expect(budget).toContain("previewDebtRepayment");
    expect(budget).toContain("previewDebtPolicy");
    expect(budget).toContain("applyAction");
  });

  test("the ledger exposes monthly reports and confirmed action history", () => {
    const ledger = source("src/screens/LedgerScreen.tsx");
    expect(ledger).toContain("buildMonthlyReports");
    expect(ledger).toContain("Monthly economic report");
    expect(ledger).toContain("A closing balance is not a period flow");
    expect(ledger).toContain("Annual accounting");
    expect(ledger).toContain("Annual flows are exact sums");
    expect(ledger).toContain("Confirmed player actions");
    expect(ledger).toContain("Session-only; cleared on load or worker restart");
  });

  test("the construction screen is wired to snapshots and the shared action path", () => {
    expect(source("src/screens/navigation.ts")).toContain('id: "construction", label: "Construction"');
    const construction = source("src/screens/ConstructionScreen.tsx");
    expect(construction).toContain("previewConstruction");
    expect(construction).toContain("start-construction");
    expect(construction).toContain("cancel-construction");
    expect(construction).toContain("set-construction-paused");
    expect(construction).toContain("Authorize construction");
    expect(construction).toContain("Project queue");
    expect(construction).toContain("waiting for");
    expect(construction).not.toContain("__world");
    const ledger = source("src/screens/LedgerScreen.tsx");
    expect(ledger).toContain("Construction outlay");
  });

  test("the industry screen is wired to snapshot policy and enterprise actions", () => {
    expect(source("src/screens/navigation.ts")).toContain('id: "industry", label: "Industry"');
    const industry = source("src/screens/IndustryScreen.tsx");
    expect(industry).toContain("previewIndustrialPolicy");
    expect(industry).toContain("previewPublicEnterpriseSupport");
    expect(industry).toContain("set-industrial-policy");
    expect(industry).toContain("support-public-enterprise");
    expect(industry).toContain("Public enterprises");
    expect(industry).toContain("Deliberately not implemented");
    expect(industry).not.toContain("__world");
  });

  test("the politics screen is wired to snapshot previews and validated actions", () => {
    expect(source("src/screens/navigation.ts")).toContain('id: "politics", label: "Politics"');
    const politics = source("src/screens/PoliticsScreen.tsx");
    expect(politics).toContain("previewLawProposal");
    expect(politics).toContain("previewInstitutionFunding");
    expect(politics).toContain("propose-law");
    expect(politics).toContain("set-institution-funding");
    expect(politics).toContain("Interest groups");
    expect(politics).toContain("State administration");
    expect(politics).toContain("Provincial unrest");
    expect(politics).toContain("No law options are defined for this slot in the current scenario.");
    expect(politics).not.toContain("__world");
  });

  test("the provider appends action history only from confirmed results", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    expect(provider).toContain('case "ACTION_RESULT"');
    expect(provider).toContain("appendPlayerAction");
    expect(provider).toContain("accepted: event.accepted");
    expect(provider).toContain("appliedActionFromSnapshot");
    expect(provider).toContain("applied,");
    // The send path stages a pending request; it does not append history.
    const applyStart = provider.indexOf("const applyAction = useCallback");
    const applyEnd = provider.indexOf("const applyFiscalPolicy = useCallback", applyStart);
    expect(applyStart).toBeGreaterThan(-1);
    expect(applyEnd).toBeGreaterThan(applyStart);
    const applyBody = provider.slice(applyStart, applyEnd);
    expect(applyBody).toContain("pendingActionsRef.current.set");
    expect(applyBody).not.toContain("appendPlayerAction");
  });

  test("the app adds no forbidden economic claims", () => {
    for (const path of [
      "src/screens/CountryScreen.tsx",
      "src/screens/BudgetScreen.tsx",
      "src/screens/ConstructionScreen.tsx",
      "src/screens/IndustryScreen.tsx",
      "src/screens/PoliticsScreen.tsx",
      "src/screens/LedgerScreen.tsx",
      "src/screens/MarketsScreen.tsx",
      "src/screens/PopulationScreen.tsx",
    ]) {
      const text = source(path);
      expect(text).not.toMatch(/\bGDP\b|(?<!not an )unemployment rate:|inflation rate:/);
    }
  });
});

function lifecycleSource(path: string): string {
  return readFileSync(join(APP, path), "utf8");
}

describe("campaign startup and autosave wiring", () => {
  test("startup reads saved metadata and offers Continue or New Game", () => {
    const provider = lifecycleSource("src/worker/SimulationProvider.tsx");
    const app = lifecycleSource("App.tsx");
    expect(provider).toContain("readStoredCampaign");
    expect(provider).toContain('setStartup("menu")');
    expect(provider).toContain("resumeSavedGame");
    expect(provider).toContain("createGame");
    expect(app).toContain("MainMenuScreen");
    expect(app).toContain("CountrySelectionScreen");
    expect(app).toContain("onNewGame");
    expect(app).toContain("onContinue");
    // D-114: saved games are listed, loaded and deleted from Load Game.
    expect(app).toContain("LoadGameScreen");
    expect(lifecycleSource("src/screens/LoadGameScreen.tsx")).toContain("Delete this saved game?");
  });

  test("campaigns save to their own slots; autosave debounce and failure feedback are present", () => {
    const provider = lifecycleSource("src/worker/SimulationProvider.tsx");
    // D-114 replaces the overwrite prompt: a new campaign starts a slot of its
    // own, so saving it can never replace another campaign.
    expect(provider).toContain("activeSlotIdRef.current = null");
    expect(provider).toContain("slotId: activeSlotIdRef.current");
    expect(provider).toContain("storeChainRef");
    expect(provider).toContain("AutosaveScheduler");
    expect(provider).toContain("requestAutosave");
    expect(provider).toContain('kind === "autosave"');
    expect(provider).toContain('"Autosave failed"');
    expect(provider).toContain('"Autosaved"');
  });

  test("the storage adapter uses the current schema and the replace-safe SaveLibrary", () => {
    const storage = lifecycleSource("src/storage/saveStorage.ts");
    expect(storage).toContain("SaveLibrary");
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
    const nativeHost = lifecycleSource("src/worker/NativeWorkerHost.tsx");
    expect(nativeHost).toContain("onRenderProcessGone");
    expect(nativeHost).toContain("onContentProcessDidTerminate");
    expect(nativeHost).toContain("onError(");
    expect(nativeHost).toContain("restart()");
    expect(nativeHost).toContain("key={reloadKey}");
  });

  test("provider pauses on backgrounding and resumes only through the lifecycle path", () => {
    const provider = lifecycleSource("src/worker/SimulationProvider.tsx");
    expect(provider).toContain("AppState.addEventListener");
    expect(provider).toContain("document.visibilityState");
    expect(provider).toContain("resumeOnVisibleRef");
    expect(provider).toContain("restartWorker");
    expect(provider).toContain("WorkerSupervisor");
    expect(provider).toContain('setSaveStatus(null)');
  });

  test("every worker event is sequenced through the supervisor", () => {
    const provider = lifecycleSource("src/worker/SimulationProvider.tsx");
    expect(provider).toContain("supervisor.receive(event)");
    expect(provider).not.toContain("handleEvent(event)");
  });

  test("player-facing copy does not retain obsolete milestone placeholders", () => {
    const status = lifecycleSource("src/index.ts");
    expect(status).toContain("playable-shell");
    expect(status).not.toContain("placeholder");
    expect(status).not.toContain("arrive in M7");
    const politics = lifecycleSource("src/screens/PoliticsScreen.tsx");
    expect(politics).not.toContain("depend on M9");
    const war = lifecycleSource("src/screens/WarScreen.tsx");
    expect(war).toContain("aged 18–45");
  });

  test("the app has a contained rendering-error fallback with retry", () => {
    const app = lifecycleSource("App.tsx");
    const boundary = lifecycleSource("src/components/AppErrorBoundary.tsx");
    expect(app).toContain("AppErrorBoundary");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("Retry rendering");
  });
});

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

/**
 * M11d slider accessibility regression.
 *
 * The web build rendered `role="slider"` with no announced value because React
 * Native Web reads the flat `aria-value*` props and ignores the
 * `accessibilityValue` object. Playtesting found the slider unusable with a
 * screen reader even though the native accessibility value was set.
 */
describe("M11d slider accessibility", () => {
  test("the slider exposes a value, range and text on the web", () => {
    const source = readFileSync(join(APP, "src/components/Slider.tsx"), "utf8");
    expect(source).toContain("accessibilityValue={{ min, max, now: value, text: display }}");
    expect(source).toContain("aria-valuemin={min}");
    expect(source).toContain("aria-valuemax={max}");
    expect(source).toContain("aria-valuenow={value}");
    expect(source).toContain("aria-valuetext={display}");
    expect(source).toContain("accessibilityActions={[{ name: \"increment\" }, { name: \"decrement\" }]}");
  });

  test("toggle chips and navigation expose their active state", () => {
    // React Native Web does not forward accessibilityState.selected for
    // role="button"; without an explicit ARIA state the active filter, layer,
    // speed or screen is visual-only.
    const chips = readFileSync(join(APP, "src/components/ui.tsx"), "utf8");
    expect(chips).toContain('"aria-pressed": active');
    const shell = readFileSync(join(APP, "src/screens/GameShell.tsx"), "utf8");
    expect(shell).toContain('"aria-current": active ? "page" : undefined');
    const selection = readFileSync(join(APP, "src/screens/CountrySelectionScreen.tsx"), "utf8");
    expect(selection).toContain('"aria-pressed": active');
  });
});
