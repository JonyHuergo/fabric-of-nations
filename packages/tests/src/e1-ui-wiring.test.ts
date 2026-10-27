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
const APP = resolve(HERE, "../../app");

function source(relativePath: string): string {
  return readFileSync(join(APP, relativePath), "utf8");
}

describe("E1 UI wiring", () => {
  test("the overview is the default tab and uses the explanation selector", () => {
    const app = source("App.tsx");
    expect(app).toMatch(/\{ id: "country", label: "Overview" \}/);
    expect(app).toMatch(/useState<TabId>\("country"\)/);

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
    expect(budget).toContain("Static estimate");
    expect(budget).toContain("Estimated net monthly fiscal change");
    expect(budget).toContain("not a forecast");
    // E1 adds no new instruments: only the existing shared action is sent.
    expect(budget).not.toMatch(/new tax|business tax|consumption tax|tariff/i);
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

  test("the provider appends action history only from confirmed results", () => {
    const provider = source("src/worker/SimulationProvider.tsx");
    expect(provider).toContain('case "ACTION_RESULT"');
    expect(provider).toContain("appendPlayerAction");
    expect(provider).toContain("accepted: event.accepted");
    expect(provider).toContain("applied:");
    // The send path stages a pending request; it does not append history.
    const applyStart = provider.indexOf("const applyFiscalPolicy = useCallback");
    const applyEnd = provider.indexOf("const doSave = useCallback", applyStart);
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
      "src/screens/LedgerScreen.tsx",
      "src/screens/MarketsScreen.tsx",
      "src/screens/PopulationScreen.tsx",
    ]) {
      const text = source(path);
      expect(text).not.toMatch(/\bGDP\b|(?<!not an )unemployment rate:|inflation rate:/);
    }
  });
});
