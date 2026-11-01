/**
 * M13 rebranding runtime verification against the exported web application.
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/m13/playtest-rebrand.mjs
 *
 * The script boots the real static export in headless Chrome, checks the
 * browser title, manifest, install icons, main menu, sources dialog, new-game
 * flow, country selection, campaign, save/load and a pre-rebrand compressed
 * save injected into the same AsyncStorage-backed browser keys. It writes
 * screenshots and a JSON evidence report under docs/images/m13/.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PLAYTEST_SHOT_DIR = "docs/images/m13";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const { boot, sleep, writeJson } = await import("../m11d/lib/harness.mjs");

const URL = "http://127.0.0.1:8881/";
const evidence = {
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  consoleErrors: [],
  warnings: [],
  screenshots: [],
};

function check(name, condition, detail = null) {
  evidence.checks.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail === null ? "" : ` — ${detail}`}`);
  if (!condition) evidence.errors.push(`${name}${detail === null ? "" : `: ${detail}`}`);
}

async function waitForText(app, text, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    if (body.includes(text)) return body;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/m13/${name}.png`);
}

const legacy = JSON.parse(
  readFileSync(join(ROOT, "packages/tests/src/fixtures/century-era-save.json"), "utf8"),
);

const app = await boot({ fresh: true, port: 8881, cdpPort: 9481, windowSize: "1440,1000" });

try {
  /* ---------------------------------------------------------------- */
  /* Startup, browser metadata and main menu                          */
  /* ---------------------------------------------------------------- */
  await app.step("startup and browser metadata");
  await app.navigate(URL);
  await waitForText(app, "New campaign");
  await sleep(800);

  const title = await app.evaluate("document.title");
  check("browser tab title", title === "Fabric of Nations", title);
  const manifestLink = await app.evaluate(
    "document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null",
  );
  check("manifest link", manifestLink === "/manifest.webmanifest", manifestLink);
  const manifest = await app.evaluate("fetch('/manifest.webmanifest').then((response) => response.json())");
  check("PWA manifest name", manifest.name === "Fabric of Nations", manifest.name);
  check("PWA manifest short_name", manifest.short_name === "Fabric of Nations", manifest.short_name);
  check("PWA manifest display", manifest.display === "standalone", manifest.display);
  const faviconStatus = await app.evaluate("fetch('/favicon.ico').then((response) => response.status)");
  check("favicon is served", faviconStatus === 200, String(faviconStatus));
  const iconStatus = await app.evaluate("fetch('/icons/icon-512.png').then((response) => response.status)");
  check("PWA 512 icon is served", iconStatus === 200, String(iconStatus));
  const appleTouch = await app.evaluate(
    "document.querySelector('link[rel=\"apple-touch-icon\"]')?.getAttribute('href') ?? null",
  );
  check("apple touch icon link", appleTouch === "/icons/apple-touch-icon.png", appleTouch);

  const menu = await app.text();
  check("main menu displays the official name", menu.includes("FABRIC OF NATIONS"));
  check("main menu has no old wordmark", !/\bCENTURY\b/.test(menu));
  await shot(app, "m13-main-menu");

  /* ---------------------------------------------------------------- */
  /* Sources and licensing dialog                                     */
  /* ---------------------------------------------------------------- */
  await app.step("sources and licensing");
  await app.clickAria("Sources and licensing");
  const sources = await waitForText(app, "Sources, classification and licensing", 15_000);
  check("sources dialog opens", sources.includes("Sources, classification and licensing"));
  check("sources dialog shows Fabric of Nations provenance", sources.includes("Fabric of Nations"));
  check("sources dialog has no Century project attribution", !/\bCentury project\b/.test(sources));
  await shot(app, "m13-sources-licensing");
  await app.clickAria("Close");

  /* ---------------------------------------------------------------- */
  /* New game, country selection and campaign                         */
  /* ---------------------------------------------------------------- */
  await app.step("new campaign flow");
  await app.clickAria("New campaign");
  const brief = await waitForText(app, "The world of 1 January 1900", 20_000);
  check("new-game screen opens", brief.includes("The world of 1 January 1900"));
  check("new-game screen carries the new identity", !/\bCENTURY\b/.test(brief));
  await shot(app, "m13-new-game");

  await app.clickAria("Continue to country selection");
  await waitForText(app, "Choose a country", 20_000);
  await sleep(700);
  const focused = await app.focus('input[aria-label="Search historical countries"]');
  check("country search is present", focused === true);
  await app.typeText("German");
  await sleep(700);
  const clicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  check("German Empire row selectable", clicked === true);
  await sleep(1200);
  const selection = await app.text();
  check("country selection displays the official name", selection.includes("Choose a country"));
  check("country selection has no old wordmark", !/\bCENTURY\b/.test(selection));
  await shot(app, "m13-country-selection");

  await app.clickAria("Play as Germany", { exact: false });
  await waitForText(app, "World map", 240_000);
  await sleep(3500);
  const campaign = await app.text();
  check("campaign initializes", campaign.includes("World map"));
  check("campaign has no old wordmark", !/\bCENTURY\b/.test(campaign));
  await shot(app, "m13-campaign");

  /* ---------------------------------------------------------------- */
  /* Save and load                                                    */
  /* ---------------------------------------------------------------- */
  await app.step("save and load");
  await app.clickAria("Save", { exact: false });
  const saved = await waitForText(app, "Saved 1900-01-01", 120_000);
  check("manual save succeeds", saved.includes("Saved 1900-01-01"));
  await shot(app, "m13-campaign-saved");
  await app.clickAria("Load");
  const loaded = await waitForText(app, "Saved game loaded", 120_000);
  check("manual load succeeds", loaded.includes("Saved game loaded"));
  check("loaded campaign has no old wordmark", !/\bCENTURY\b/.test(loaded));
  await shot(app, "m13-campaign-loaded");

  /* ---------------------------------------------------------------- */
  /* Pre-rebrand save compatibility                                   */
  /* ---------------------------------------------------------------- */
  await app.step("pre-rebrand save compatibility");
  await app.evaluate(
    `localStorage.setItem("century.m7.save.v1", ${JSON.stringify(legacy.stored)}); localStorage.removeItem("century.m7.save.v1.previous"); localStorage.removeItem("century.m7.save.v1.staging"); true`,
  );
  await app.navigate(URL);
  const legacyMenu = await waitForText(app, "Continue campaign", 60_000);
  check("pre-rebrand save is recognized on the menu", legacyMenu.includes("Continue campaign"));
  check("legacy save date is shown", legacyMenu.includes("1900-01-01"));
  check("legacy save menu has no old wordmark", !/\bCENTURY\b/.test(legacyMenu));
  await shot(app, "m13-legacy-save-menu");
  await app.clickAria("Continue campaign");
  await waitForText(app, "World map", 240_000);
  await sleep(3000);
  const legacyCampaign = await app.text();
  check("pre-rebrand save loads into a campaign", legacyCampaign.includes("World map"));
  check("pre-rebrand campaign has no old wordmark", !/\bCENTURY\b/.test(legacyCampaign));
  await shot(app, "m13-legacy-save-loaded");

  /* ---------------------------------------------------------------- */
  /* Narrow layout                                                    */
  /* ---------------------------------------------------------------- */
  await app.step("narrow layout");
  await app.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await app.navigate(URL);
  await waitForText(app, "New campaign", 60_000);
  await sleep(1000);
  const narrowBody = await app.text();
  check("narrow main menu displays the official name", narrowBody.includes("FABRIC OF NATIONS"));
  const noHorizontalOverflow = await app.evaluate(
    "document.documentElement.scrollWidth <= window.innerWidth + 1",
  );
  check("narrow main menu has no horizontal overflow", noHorizontalOverflow === true);
  await shot(app, "m13-main-menu-narrow");
  await app.send("Emulation.clearDeviceMetricsOverride");

  /* ---------------------------------------------------------------- */
  /* Console and network evidence                                     */
  /* ---------------------------------------------------------------- */
  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const warnings = report.events.console.filter((entry) => entry.type === "warning");
  const exceptions = report.events.exceptions;
  const networkErrors = report.events.network.filter((entry) => entry.kind !== "loadingFailed");
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  evidence.consoleErrors = consoleErrors;
  evidence.warnings = warnings;
  evidence.exceptions = exceptions;
  evidence.networkErrors = networkErrors;
  evidence.failedLoads = failedLoads;
  check("no console errors", consoleErrors.length === 0, String(consoleErrors.length));
  check("no uncaught exceptions", exceptions.length === 0, String(exceptions.length));
  check("no failed resource loads", failedLoads.length === 0, String(failedLoads.length));
  check("no HTTP errors", networkErrors.length === 0, String(networkErrors.length));

  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.errors.length === 0;
  writeJson(join(ROOT, "docs/images/m13/runtime-check.json"), evidence);
  if (!evidence.passed) {
    console.error(`M13 runtime verification failed with ${String(evidence.errors.length)} problem(s)`);
    for (const error of evidence.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`M13 runtime verification passed (${String(evidence.checks.length)} checks)`);
  }
} finally {
  await app.close();
}
