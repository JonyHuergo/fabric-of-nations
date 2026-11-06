/**
 * P5 (D-143) browser check of the land, harvest, own-consumption and resource figures
 * at the phone reference size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p5/playtest-land.mjs
 *
 * Starts a United States campaign, runs a few days, taps New York on the map and checks
 * the province panel's harvest row, farm food kept at home and known deposits; then opens
 * the map lens switch and checks that the Harvest lens is offered with a legend and that
 * its controls are at least 44 pt. Records console errors, exceptions and failed loads.
 * Not a substitute for the designer's device test.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p5";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const PORT = 8886;
const URL = `http://127.0.0.1:${PORT}/`;
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

const press = (app, label) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const nodes = Array.from(document.querySelectorAll('[role="button"], [role="tab"], button'));
    const target = nodes.find((node) => node.getAttribute('aria-label') === wanted || (node.textContent ?? '').trim() === wanted);
    if (target === undefined) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  })()`);

const ENGINE = `document.querySelector('iframe').contentWindow.__mapEngine`;
const engine = (app, expression) => app.evaluate(`(() => { const e = ${ENGINE}; return ${expression}; })()`);

async function clickAt(app, x, y) {
  const mouse = (type, extra = {}) => app.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  await mouse("mouseMoved");
  await mouse("mousePressed", { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", { button: "left", clickCount: 1 });
  await sleep(200);
}

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/p5/${name}.png`);
}

function figure(body, label) {
  const index = body.indexOf(label);
  return index < 0 ? null : body.slice(index, index + 200).replace(/\s+/g, " ");
}

mkdirSync(join(ROOT, "docs/images/p5"), { recursive: true });
const app = await boot({ fresh: true, port: PORT, cdpPort: 9486, windowSize: VIEWPORT });

try {
  await app.step("new United States campaign");
  await app.navigate(URL);
  await waitForText(app, "NEW CAMPAIGN");
  await sleep(800);
  const size = JSON.parse(await app.evaluate("JSON.stringify({ width: window.innerWidth, height: window.innerHeight })"));
  check("phone landscape viewport", size.width === 844 && size.height === 390, JSON.stringify(size));
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

  await app.step("run a few days so farms are staffed");
  await app.clickAria("Play");
  await waitForText(app, "4 Jan 1900", 240_000);
  await app.clickAria("Pause");
  await sleep(1500);

  await app.step("province panel");
  const hasEngine = await app.evaluate(`document.querySelector('iframe')?.contentWindow?.__mapEngine !== undefined`);
  if (hasEngine) {
    await engine(app, `e.setView(-74.0, 42.9, 10)`);
    await sleep(900);
    const box = await app.evaluate(`(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
    const point = await engine(app, `e.screenOf(-74.0, 42.9)`);
    await clickAt(app, box.left + point.x, box.top + point.y);
  } else {
    const clicked = await app.evaluate(`(() => {
      const path = Array.from(document.querySelectorAll('svg path[aria-label]')).find((node) => (node.getAttribute('aria-label') ?? '').startsWith('New York, USA'));
      if (!path) return false;
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    check("SVG fallback map: New York pressed", clicked === true);
  }
  await sleep(2000);
  let body = await waitForText(app, "Harvest 1900", 30_000);
  const harvest = figure(body, "Harvest 1900");
  check("harvest row shows this year's weather against normal", harvest !== null && /\d+% of normal/.test(harvest), harvest);
  check("harvest row names farms and workers per hectare", harvest !== null && /workers per hectare of cropland/.test(harvest), harvest);
  const food = figure(body, "Farm food today");
  check("farm food row shows the share kept at home", food !== null && /\d+% kept at home/.test(food), food);
  check("farm food row lists grain kept", food !== null && /Grain [\d.]+ [kMb]?n? ?t?/.test(food) && food.includes("kept"), food);
  const timber = figure(body, "Timber");
  check("known deposits listed with remaining stock and quality", timber !== null && / left/.test(timber) && /Quality \d+%/.test(timber), timber);
  const panelWidth = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('*')).find((candidate) => (candidate.textContent ?? '').trim().startsWith('Farm food today') && candidate.children.length > 0);
    if (!node) return null;
    node.scrollIntoView({ block: 'center' });
    return node.getBoundingClientRect().right;
  })()`);
  check("land rows fit the phone width", panelWidth !== null && panelWidth <= 844, String(panelWidth));
  await sleep(400);
  await shot(app, "p5-844x390-province-land");
  await press(app, "Close sheet");
  await sleep(600);

  await app.step("harvest lens");
  const opened = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Map lens'));
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height, width: box.width };
  })()`);
  check("lens switch is at least 44 pt", opened !== null && opened.height >= 44, JSON.stringify(opened));
  await sleep(800);
  const chip = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.textContent ?? '').trim() === 'Harvest');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height };
  })()`);
  check("Harvest lens offered, at least 44 pt", chip !== null && chip.height >= 44, JSON.stringify(chip));
  await sleep(1500);
  body = await app.text();
  check("harvest legend shows the bands", body.includes("Below 85%") && body.includes("115% and above"), figure(body, "Below 85%"));
  await shot(app, "p5-844x390-harvest-lens");

  const report = await app.dumpReport();
  const consoleErrors = report.events.console.filter((entry) => entry.type === "error");
  const failedLoads = report.events.network.filter((entry) => entry.kind === "loadingFailed");
  check("no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
  check("no uncaught exceptions", report.events.exceptions.length === 0, JSON.stringify(report.events.exceptions.slice(0, 5)));
  check("no failed resource loads", failedLoads.length === 0, JSON.stringify(failedLoads.slice(0, 5)));
} catch (error) {
  evidence.errors.push(String(error?.stack ?? error));
  console.error(error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  writeJson(join(ROOT, "docs/images/p5/playtest-land.json"), evidence);
  await app.close();
}
console.log(`${String(evidence.checks.filter((entry) => entry.passed).length)}/${String(evidence.checks.length)} checks passed; ${String(evidence.errors.length)} errors`);
process.exit(evidence.errors.length === 0 ? 0 : 1);
