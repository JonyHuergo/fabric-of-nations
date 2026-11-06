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
