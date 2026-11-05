/**
 * P4 (D-142) browser check of the demographic figures at the phone reference size
 * (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p4/playtest-demography.mjs
 *
 * Starts a United States campaign, opens Society → Population and checks the birth and
 * death rates, children per woman, life expectancy, the population pyramid, the yearly
 * history switch (controls ≥ 44 pt) and the causes; taps a province on the map and checks
 * its demography rows and pyramid; then runs the fastest speed into 1901 and checks that
 * the closed year appears in the history and the figures moved. Records console errors,
 * exceptions and failed loads. Not a substitute for the designer's device test.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p4";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const PORT = 8885;
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
  evidence.screenshots.push(`docs/images/p4/${name}.png`);
}

function figure(body, label) {
  const index = body.indexOf(label);
  return index < 0 ? null : body.slice(index, index + 160).replace(/\s+/g, " ");
}

mkdirSync(join(ROOT, "docs/images/p4"), { recursive: true });
const app = await boot({ fresh: true, port: PORT, cdpPort: 9485, windowSize: VIEWPORT });

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

  await app.step("Population ledger");
  check("Society domain opens", (await press(app, "Society")) === true);
  await sleep(900);
  await press(app, "Population");
  await sleep(1200);
  let body = await waitForText(app, "Births, deaths and lifespans", 30_000);
  check("births, deaths and lifespans section", body.includes("Births, deaths and lifespans"));
  const rates = figure(body, "Births and deaths");
  check("birth and death rates shown per 1,000", rates !== null && /\d+\.\d \/ \d+\.\d/.test(rates), rates);
  check("children per woman shown", /Children per woman\s*\d\.\d\d/.test(body), figure(body, "Children per woman"));
  check("life expectancy shown in years", /Life expectancy\s*\d+\.\d years/.test(body), figure(body, "Life expectancy"));
  check("food eaten shown", body.includes("Food eaten"), figure(body, "Food eaten"));
  const pyramid = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Population pyramid'));
    if (!node) return null;
    node.scrollIntoView({ block: 'center' });
    const box = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label'), width: box.width, height: box.height, right: box.right };
  })()`);
  check("population pyramid drawn inside the sheet", pyramid !== null && pyramid.height > 100 && pyramid.right <= 844, JSON.stringify(pyramid));
  await sleep(400);
  await shot(app, "p4-844x390-population-pyramid");
  const tabs = await app.evaluate(`(() => Array.from(document.querySelectorAll('[role="tab"]'))
    .map((node) => ({ text: (node.textContent ?? '').trim(), height: node.getBoundingClientRect().height })))()`);
  check("yearly history before the first close explains itself", body.includes("The yearly record starts when the first year closes"));
  check("history series switch absent before the first year closes", Array.isArray(tabs) && tabs.length === 0, JSON.stringify(tabs));
  const opened = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.textContent ?? '').trim().startsWith('What moves these figures'));
    if (!node) return false;
    node.scrollIntoView({ block: 'center' });
    node.click();
    return true;
  })()`);
  check("causes disclosure present", opened === true);
  await sleep(600);
  body = await app.text();
  check("causes name the player's levers", body.includes("Sanitation in towns") && body.includes("Public health and medicine") && body.includes("Contraception"));
  await shot(app, "p4-844x390-population-causes");
  await press(app, "Close sheet");
  await sleep(600);

  await app.step("province panel");
  // The WebGL map lives in an iframe; headless Chrome without WebGL draws the SVG
  // fallback, whose province paths carry "<name>, <owner tag>" labels.
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
  await sleep(1500);
  body = await app.text();
  check("a press opens the province sheet", /Province \d+/u.test(body) || body.includes("Towns and literacy"));
  check("province shows births and deaths", body.includes("Births and deaths"), figure(body, "Births and deaths"));
  check("province shows life expectancy", body.includes("Life expectancy"), figure(body, "Life expectancy"));
  const provincePyramid = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Population pyramid'));
    if (!node) return null;
    node.scrollIntoView({ block: 'center' });
    const box = node.getBoundingClientRect();
    return { label: node.getAttribute('aria-label'), height: box.height, right: box.right };
  })()`);
  check("province pyramid drawn", provincePyramid !== null && provincePyramid.height > 60, JSON.stringify(provincePyramid));
  await sleep(400);
  await shot(app, "p4-844x390-province-demography");
  await press(app, "Close sheet");
  await sleep(500);

  await app.step("run into 1901");
  await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Speed '));
    node?.click();
  })()`);
  await sleep(300);
  await press(app, "30×");
  await sleep(200);
  await app.clickAria("Play");
  const started = Date.now();
  let reached = false;
  while (Date.now() - started < 1_500_000) {
    const text = await app.text();
    if (/ 1901/.test(text)) {
      reached = true;
      break;
    }
    await sleep(3000);
  }
  check("simulation reached 1901", reached);
  await app.clickAria("Pause");
  await sleep(1500);
  await press(app, "Society");
  await sleep(900);
  await press(app, "Population");
  await sleep(1500);
  body = await app.text();
  const rates1901 = figure(body, "Births and deaths");
  check("rates changed over the year", rates1901 !== null && rates1901 !== rates, `${String(rates)} → ${String(rates1901)}`);
  const tabsAfter = await app.evaluate(`(() => Array.from(document.querySelectorAll('[role="tab"]'))
    .map((node) => ({ text: (node.textContent ?? '').trim(), height: node.getBoundingClientRect().height })))()`);
  check("history series switch appears after the first year", Array.isArray(tabsAfter) && tabsAfter.length === 3, JSON.stringify(tabsAfter));
  check("history switch controls are at least 44 pt tall", Array.isArray(tabsAfter) && tabsAfter.length > 0 && tabsAfter.every((tab) => tab.height >= 44), JSON.stringify(tabsAfter));
  await press(app, "Life expectancy");
  await sleep(500);
  const chart = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => / from \\d{4} to \\d{4}/.test(candidate.getAttribute('aria-label') ?? ''));
    if (!node) return null;
    node.scrollIntoView({ block: 'center' });
    return node.getAttribute('aria-label');
  })()`);
  check("history chart labels its series and years", chart !== null, String(chart));
  await sleep(400);
  await shot(app, "p4-844x390-population-1901");

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
  writeJson(join(ROOT, "docs/images/p4/playtest-demography.json"), evidence);
  await app.close();
}
console.log(`${String(evidence.checks.filter((entry) => entry.passed).length)}/${String(evidence.checks.length)} checks passed; ${String(evidence.errors.length)} errors`);
process.exit(evidence.errors.length === 0 ? 0 : 1);
