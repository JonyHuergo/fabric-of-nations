/**
 * Performance-stage browser check at the phone reference size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/perf/playtest-stage.mjs
 *
 * Starts a new United States campaign in headless Chrome at 844x390 CSS pixels,
 * switches the simulation to the fastest speed, saves, loads, and records the
 * observable state, console errors, uncaught exceptions and failed resource
 * loads. Node diagnostics are not a substitute for the designer's device test;
 * this only proves the web path works at the phone layout after the performance
 * changes.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/perf";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const URL = "http://127.0.0.1:8883/";
const VIEWPORT = "844,390";
const evidence = {
  startedAt: new Date().toISOString(),
  viewport: VIEWPORT,
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
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`);
}

/** Wait until any candidate appears; returns the first match and the body. */
async function waitForAny(app, texts, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await app.text();
    const match = texts.find((text) => body.includes(text));
    if (match !== undefined) return { match, body };
    await sleep(400);
  }
  return { match: null, body: await app.text() };
}

async function clickByText(app, text) {
  return app.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const match = nodes.find((node) => (node.textContent ?? '').trim() === wanted);
    if (!match) return false;
    match.scrollIntoView({ block: 'center' });
    match.click();
    return true;
  })()`);
}

mkdirSync(join(ROOT, "docs/images/perf"), { recursive: true });

const app = await boot({
  fresh: true,
  port: 8883,
  cdpPort: 9483,
  windowSize: VIEWPORT,
});

try {
  await app.step("startup and main menu");
  await app.navigate(URL);
  // The menu renders the action in the display face (upper case); the accessible
  // label is "New campaign".
  await waitForText(app, "NEW CAMPAIGN");
  await sleep(700);
  const metrics = await app.evaluate(
    "JSON.stringify({ width: window.innerWidth, height: window.innerHeight })",
  );
  const parsed = JSON.parse(metrics);
  check("phone landscape viewport", parsed.width === 844 && parsed.height === 390, metrics);
  await app.screenshot("stage-844x390-menu");
  evidence.screenshots.push("docs/images/perf/stage-844x390-menu.png");

  await app.step("new United States campaign");
  await app.clickAria("New campaign");
  await waitForText(app, "The world of 1 January 1900", 20_000);
  await app.clickAria("Continue to country selection");
  await waitForText(app, "Choose a country", 20_000);
  await sleep(700);
  await app.focus('input[aria-label="Search historical countries"]');
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
  // The Living Atlas campaign shell shows the player's treasury/people band rather
  // than a "World map" heading.
  await waitForText(app, "TREASURY", 240_000);
  await sleep(3000);
  const campaign = await app.text();
  check("campaign initializes at the phone layout", campaign.includes("TREASURY"));
  await app.screenshot("stage-844x390-campaign");
  evidence.screenshots.push("docs/images/perf/stage-844x390-campaign.png");

  await app.step("save and load at day 0");
  // Save/Load live on the campaign sheet, opened from the player chip. Saving
  // before the campaign grows keeps the web stored form inside the browser's
  // localStorage quota (three copies: staging, primary, previous); the quota limit
  // for long campaigns is recorded in the report as a web-storage observation.
  const panel = await clickByText(app, "United States");
  check("campaign sheet opens", panel === true);
  await sleep(700);
  const saveStarted = Date.now();
  await app.clickAria("Save");
  const saveOutcome = await waitForAny(app, ["Saved 1900-", "Save failed"], 180_000);
  const saveMs = Date.now() - saveStarted;
  check(
    "manual save succeeds",
    saveOutcome.match === "Saved 1900-",
    `${String(saveMs)} ms incl. UI${saveOutcome.match === null ? `: ${saveOutcome.body.slice(-300)}` : ""}`,
  );
  const loadStarted = Date.now();
  await app.clickAria("Load last save");
  const loadOutcome = await waitForAny(app, ["Saved game loaded", "could not be read"], 180_000);
  const loadMs = Date.now() - loadStarted;
  check(
    "manual load succeeds",
    loadOutcome.match === "Saved game loaded",
    `${String(loadMs)} ms incl. UI${loadOutcome.match === null ? `: ${loadOutcome.body.slice(-300)}` : ""}`,
  );
  await app.screenshot("stage-844x390-loaded");
  evidence.screenshots.push("docs/images/perf/stage-844x390-loaded.png");
  await app.clickAria("Close sheet");
  await sleep(700);

  await app.step("fastest speed");
  const opened = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find(
      (candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Speed '),
    );
    if (!node) return false;
    node.click();
    return true;
  })()`);
  check("speed control present", opened === true);
  await sleep(300);
  const fastest = await clickByText(app, "30×");
  check("fastest speed selectable", fastest === true);
  await sleep(200);
  const speedLabel = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find(
      (candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Speed '),
    );
    return node ? node.getAttribute('aria-label') : null;
  })()`);
  check("speed set to 30x", String(speedLabel).startsWith("Speed 30 "), String(speedLabel));

  const beforeRun = await app.text();
  await app.clickAria("Play");
  const startedAt = Date.now();
  await sleep(8000);
  await app.clickAria("Pause");
  const afterRun = await app.text();
  const advanced = afterRun !== beforeRun && !afterRun.includes("1 Jan 1900");
  check("simulation advanced while playing", advanced, `wall ${String(Date.now() - startedAt)} ms`);
  await app.screenshot("stage-844x390-playing");
  evidence.screenshots.push("docs/images/perf/stage-844x390-playing.png");

  await app.step("console and network evidence");
  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const exceptions = report.events.exceptions;
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  evidence.consoleErrors = consoleErrors;
  evidence.exceptions = exceptions;
  evidence.failedLoads = failedLoads;
  evidence.saveUiMs = saveMs;
  evidence.loadUiMs = loadMs;
  check("no console errors", consoleErrors.length === 0, String(consoleErrors.length));
  check("no uncaught exceptions", exceptions.length === 0, String(exceptions.length));
  check("no failed resource loads", failedLoads.length === 0, String(failedLoads.length));

  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.errors.length === 0;
  writeJson(join(ROOT, "docs/images/perf/browser-check.json"), evidence);
  if (!evidence.passed) {
    console.error(`performance browser check failed with ${String(evidence.errors.length)} problem(s)`);
    for (const error of evidence.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`performance browser check passed (${String(evidence.checks.length)} checks)`);
  }
} finally {
  await app.close();
}
