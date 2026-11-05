/**
 * P3 (D-141) browser check of the display currency at the phone reference size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p3/playtest-currency.mjs
 *
 * Opens Settings from the title screen, starts a new United States campaign, reads the
 * treasury in the own currency (USD), switches the display currency to pound sterling and
 * to RUSD in the campaign sheet's Settings panel, and checks that the converted labels
 * follow while the simulated date and the world do not move. Records console errors,
 * exceptions and failed loads. Not a substitute for the designer's device test.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p3";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const URL = "http://127.0.0.1:8884/";
const VIEWPORT = "844,390";
const evidence = { startedAt: new Date().toISOString(), viewport: VIEWPORT, checks: [], errors: [], screenshots: [] };

function check(name, condition, detail = null) {
  evidence.checks.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail === null ? "" : ` — ${detail}`}`);
  if (!condition) evidence.errors.push(`${name}${detail === null ? "" : `: ${detail}`}`);
}

async function waitForText(app, text, timeout = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    if (body.includes(text)) return body;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

/** The treasury readout of the top band: the text after its "TREASURY" label. */
async function treasuryReadout(app) {
  return app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('div'));
    const label = nodes.find((node) => (node.textContent ?? '').trim().toUpperCase() === 'TREASURY' && node.children.length === 0);
    const value = label?.nextElementSibling ?? label?.parentElement?.lastElementChild;
    return value ? (value.textContent ?? '').trim() : null;
  })()`);
}

/** Press a display-currency option by its accessible label; scrolls it into view first. */
async function chooseCurrency(app, label) {
  return app.evaluate(`(() => {
    const wanted = ${JSON.stringify(`Display currency: ${label}`)};
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => candidate.getAttribute('aria-label') === wanted);
    if (!node) return null;
    node.scrollIntoView({ block: 'center' });
    node.click();
    const box = node.getBoundingClientRect();
    return { height: box.height, width: box.width };
  })()`);
}

async function openOtherCurrencies(app) {
  return app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.textContent ?? '').trim().startsWith('Other currencies'));
    if (!node) return false;
    if (node.getAttribute('aria-expanded') !== 'true') node.click();
    return true;
  })()`);
}

mkdirSync(join(ROOT, "docs/images/p3"), { recursive: true });
const app = await boot({ fresh: true, port: 8884, cdpPort: 9484, windowSize: VIEWPORT });

try {
  await app.step("title screen settings");
  await app.navigate(URL);
  await waitForText(app, "NEW CAMPAIGN");
  await sleep(800);
  const size = JSON.parse(await app.evaluate("JSON.stringify({ width: window.innerWidth, height: window.innerHeight })"));
  check("phone landscape viewport", size.width === 844 && size.height === 390, JSON.stringify(size));
  const settingsBox = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label="Settings"]'))[0];
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: box.height };
  })()`);
  check("Settings entry on the title screen, inside the viewport", settingsBox !== null && settingsBox.bottom <= 390, JSON.stringify(settingsBox));
  check("Settings entry is at least 44 pt tall", settingsBox !== null && settingsBox.height >= 44, JSON.stringify(settingsBox));
  await app.screenshot("p3-844x390-menu");
  evidence.screenshots.push("docs/images/p3/p3-844x390-menu.png");
  await app.clickAria("Settings");
  await waitForText(app, "Display currency", 20_000);
  await sleep(500);
  const menuDialog = await app.text();
  check("title-screen selector lists own currency and RUSD", menuDialog.includes("Own currency") && menuDialog.includes("Reference US Dollars (RUSD)"));
  await app.screenshot("p3-844x390-menu-settings");
  evidence.screenshots.push("docs/images/p3/p3-844x390-menu-settings.png");
  await app.clickAria("Close");
  await sleep(500);

  await app.step("new United States campaign");
  await app.clickAria("New campaign");
  await waitForText(app, "The world of 1 January 1900", 20_000);
  await app.clickAria("Continue to country selection");
  await waitForText(app, "Choose a country", 20_000);
  await sleep(700);
  await app.focus('input[aria-label="Search historical countries"]');
  await app.typeText("United States");
  await sleep(700);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('United States of America'));
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    if (match) { match.scrollIntoView({ block: 'center' }); match.click(); }
  })()`);
  await sleep(1200);
  await app.clickAria("Play as United States", { exact: false });
  await waitForText(app, "TREASURY", 240_000);
  await sleep(3000);
  const ownTreasury = await treasuryReadout(app);
  const dateBefore = (await app.text()).match(/\d{1,2} [A-Z][a-z]{2} 1900/)?.[0] ?? null;
  check("treasury shown in the own currency (USD)", /USD$/.test(String(ownTreasury)), String(ownTreasury));
  await app.screenshot("p3-844x390-campaign-usd");
  evidence.screenshots.push("docs/images/p3/p3-844x390-campaign-usd.png");

  await app.step("switch display currency in the campaign sheet");
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').endsWith('open campaign'));
    node?.click();
  })()`);
  await waitForText(app, "Display currency", 20_000);
  await sleep(600);
  check("other currencies disclosure present", (await openOtherCurrencies(app)) === true);
  await sleep(400);
  const gbpRow = await chooseCurrency(app, "Pound sterling");
  check("pound sterling selectable", gbpRow !== null, JSON.stringify(gbpRow));
  check("currency rows are at least 44 pt tall", gbpRow !== null && gbpRow.height >= 44, JSON.stringify(gbpRow));
  await sleep(800);
  await app.screenshot("p3-844x390-settings-gbp");
  evidence.screenshots.push("docs/images/p3/p3-844x390-settings-gbp.png");
  const sheetText = await app.text();
  check("selector preview converts to GBP", /1\.00M RUSD shows as [\d.]+k GBP/.test(sheetText), sheetText.match(/1\.00M RUSD shows as [^\n]*/)?.[0] ?? "missing");
  await app.clickAria("Close sheet");
  await sleep(800);
  const gbpTreasury = await treasuryReadout(app);
  check("treasury converts to GBP", /GBP$/.test(String(gbpTreasury)), String(gbpTreasury));

  const usd = Number.parseFloat(String(ownTreasury));
  const gbp = Number.parseFloat(String(gbpTreasury));
  const ratio = usd / gbp;
  check("USD/GBP ratio is the 1900 parity (4.8665)", Math.abs(ratio / 4.8665 - 1) < 0.02, ratio.toFixed(4));

  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').endsWith('open campaign'));
    node?.click();
  })()`);
  await waitForText(app, "Display currency", 20_000);
  await sleep(500);
  check("RUSD selectable", (await chooseCurrency(app, "Reference US Dollars (RUSD)")) !== null);
  await sleep(600);
  await app.clickAria("Close sheet");
  await sleep(800);
  const rusdTreasury = await treasuryReadout(app);
  check("treasury shown in RUSD", /RUSD$/.test(String(rusdTreasury)), String(rusdTreasury));
  const dateAfter = (await app.text()).match(/\d{1,2} [A-Z][a-z]{2} 1900/)?.[0] ?? null;
  check("changing the display currency does not advance the simulation", dateBefore === dateAfter, `${String(dateBefore)} → ${String(dateAfter)}`);
  await app.screenshot("p3-844x390-campaign-rusd");
  evidence.screenshots.push("docs/images/p3/p3-844x390-campaign-rusd.png");

  await app.step("a screen with money labels");
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').endsWith('open campaign'));
    node?.click();
  })()`);
  await waitForText(app, "Display currency", 20_000);
  await sleep(500);
  await chooseCurrency(app, "Own currency · United States dollar");
  await sleep(500);
  await app.clickAria("Close sheet");
  await sleep(600);
  const economy = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label="Economy"]'))[0];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  check("economy domain opens", economy === true);
  await sleep(1200);
  const budget = await app.text();
  check("budget labels are in USD", /\d[\d.]*[kMBT]? USD/.test(budget) && !/\d[\d.]*[kMBT]? RUSD/.test(budget));
  await app.screenshot("p3-844x390-budget-usd");
  evidence.screenshots.push("docs/images/p3/p3-844x390-budget-usd.png");

  await app.step("title screen with a saved campaign");
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').endsWith('open campaign'));
    node?.click();
  })()`);
  await waitForText(app, "Display currency", 20_000);
  await sleep(500);
  await app.clickAria("Save");
  await waitForText(app, "Saved 1900-", 180_000);
  await app.navigate(URL);
  await waitForText(app, "CONTINUE", 120_000);
  await sleep(1500);
  const entries = JSON.parse(
    await app.evaluate(`JSON.stringify(["Continue", "Load game", "New campaign", "The world of 1900", "Settings"].map((label) => {
      const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '') === label || (candidate.getAttribute('aria-label') ?? '').startsWith(label + ','));
      if (!node) return { label, missing: true };
      const box = node.getBoundingClientRect();
      return { label, top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) };
    }))`),
  );
  const settingsWithSave = entries.find((entry) => entry.label === "Settings");
  check(
    "with a save, every title entry including Settings fits in 390 pt",
    entries.every((entry) => entry.missing !== true && entry.bottom <= 390 && entry.height >= 44),
    JSON.stringify(entries),
  );
  check("Settings entry present with a save", settingsWithSave !== undefined && settingsWithSave.missing !== true);
  await app.screenshot("p3-844x390-menu-with-save");
  evidence.screenshots.push("docs/images/p3/p3-844x390-menu-with-save.png");

  await app.step("console and network evidence");
  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const exceptions = report.events.exceptions;
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  Object.assign(evidence, { consoleErrors, exceptions, failedLoads });
  check("no console errors", consoleErrors.length === 0, String(consoleErrors.length));
  check("no uncaught exceptions", exceptions.length === 0, String(exceptions.length));
  check("no failed resource loads", failedLoads.length === 0, String(failedLoads.length));

  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.errors.length === 0;
  writeJson(join(ROOT, "docs/images/p3/browser-check.json"), evidence);
  if (!evidence.passed) {
    console.error(`P3 browser check failed with ${String(evidence.errors.length)} problem(s)`);
    for (const error of evidence.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`P3 browser check passed (${String(evidence.checks.length)} checks)`);
  }
} finally {
  await app.close();
}
