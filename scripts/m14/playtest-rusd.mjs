/**
 * M14 RUSD runtime verification against the exported web application.
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/m14/playtest-rusd.mjs
 *
 * Creates a United States campaign, visits the economic screens, checks that
 * RUSD appears consistently and SUSD does not, exercises save/load across the
 * protocol-16 worker boundary, and records screenshots plus console evidence.
 */
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/m14";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const URL = "http://127.0.0.1:8882/";
const evidence = {
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  screenshots: [],
};

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
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/m14/${name}.png`);
}

async function clickTab(app, label) {
  const clicked = await app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const match = nodes.find((node) => (node.textContent ?? '').trim().endsWith(wanted));
    if (!match) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  if (clicked !== true) throw new Error(`tab ${label} not found`);
  await sleep(900);
}

const app = await boot({ fresh: true, port: 8882, cdpPort: 9482, windowSize: "1440,1000" });

try {
  await app.step("startup and main menu");
  await app.navigate(URL);
  await waitForText(app, "New campaign");
  await sleep(700);
  const menu = await app.text();
  check("main menu displays the official game name", menu.includes("FABRIC OF NATIONS"));
  check("main menu has no SUSD", !/\bSUSD\b/.test(menu));
  await shot(app, "m14-main-menu");

  await app.step("new United States campaign");
  await app.clickAria("New campaign");
  await waitForText(app, "The world of 1 January 1900", 20_000);
  await app.clickAria("Continue to country selection");
  await waitForText(app, "Choose a country", 20_000);
  await sleep(700);
  const focused = await app.focus('input[aria-label="Search historical countries"]');
  check("country search is present", focused === true);
  await app.typeText("United States");
  await sleep(700);
  const clicked = await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('United States of America'));
    if (matches.length === 0) return false;
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
  check("United States row selectable", clicked === true);
  await sleep(1200);
  await app.clickAria("Play as United States", { exact: false });
  await waitForText(app, "World map", 240_000);
  await sleep(3000);
  const campaign = await app.text();
  check("campaign initializes", campaign.includes("World map"));
  check("campaign has no SUSD", !/\bSUSD\b/.test(campaign));
  check("campaign displays RUSD", /\bRUSD\b/.test(campaign));
  await shot(app, "m14-campaign");

  await app.step("monetary and economic screens");
  const screens = [
    ["Money", "RUSD — Reference US Dollars", "m14-money"],
    ["Budget", "Budget", "m14-budget"],
    ["Markets", "Markets", "m14-markets"],
    ["Ledger", "Ledger", "m14-ledger"],
    ["Trade", "Trade", "m14-trade"],
    ["Overview", "Overview", "m14-overview"],
  ];
  for (const [tab, anchor, shotName] of screens) {
    await clickTab(app, tab);
    const body = await waitForText(app, anchor, 30_000);
    check(`${tab} screen displays RUSD`, /\bRUSD\b/.test(body));
    check(`${tab} screen has no SUSD`, !/\bSUSD\b/.test(body));
    await shot(app, shotName);
  }

  await app.step("save and load");
  await app.clickAria("Save", { exact: false });
  const saved = await waitForText(app, "Saved 1900-01-01", 120_000);
  check("manual save succeeds", saved.includes("Saved 1900-01-01"));
  check("saved campaign has no SUSD", !/\bSUSD\b/.test(saved));
  await app.clickAria("Load");
  const loaded = await waitForText(app, "Saved game loaded", 120_000);
  check("manual load succeeds", loaded.includes("Saved game loaded"));
  check("loaded campaign displays RUSD", /\bRUSD\b/.test(loaded));
  check("loaded campaign has no SUSD", !/\bSUSD\b/.test(loaded));
  await shot(app, "m14-loaded");

  await app.step("console and network evidence");
  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const exceptions = report.events.exceptions;
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  evidence.consoleErrors = consoleErrors;
  evidence.exceptions = exceptions;
  evidence.failedLoads = failedLoads;
  check("no console errors", consoleErrors.length === 0, String(consoleErrors.length));
  check("no uncaught exceptions", exceptions.length === 0, String(exceptions.length));
  check("no failed resource loads", failedLoads.length === 0, String(failedLoads.length));

  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.errors.length === 0;
  writeJson(join(ROOT, "docs/images/m14/runtime-check.json"), evidence);
  if (!evidence.passed) {
    console.error(`M14 runtime verification failed with ${String(evidence.errors.length)} problem(s)`);
    for (const error of evidence.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`M14 runtime verification passed (${String(evidence.checks.length)} checks)`);
  }
} finally {
  await app.close();
}
