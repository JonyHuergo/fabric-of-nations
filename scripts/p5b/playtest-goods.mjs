/**
 * P5b (plan section 11.5) browser check of the 58-good screens at the phone reference
 * size (844x390).
 *
 * Usage:
 *   pnpm -F @century/app export:web
 *   node scripts/p5b/playtest-goods.mjs
 *
 * Starts a Germany campaign, runs two days, then checks: the Markets screen's goods search
 * and group chips (at least 44 pt), grouped goods with "not traded here", and that opening
 * another market brings its prices (protocol 22, SET_MARKET_FOCUS); the Country screen's
 * grouped production list; the Construction screen's sector groups with a locked type
 * naming its technology; the Money screen's metal standard and currency-change controls.
 * Records console errors, exceptions and failed loads. Not a substitute for the designer's
 * device test.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PLAYTEST_SHOT_DIR = "docs/images/p5b";

const { boot, sleep, writeJson, ROOT } = await import("../m11d/lib/harness.mjs");

const PORT = 8887;
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

/** Click the first button whose aria-label or text equals (or, inexact, starts with) the label. */
const press = (app, label, exact = true) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const exact = ${JSON.stringify(exact)};
    const nodes = Array.from(document.querySelectorAll('[role="button"], [role="tab"], button'));
    const text = (node) => (node.getAttribute('aria-label') ?? (node.textContent ?? '')).trim();
    const target = nodes.find((node) => exact ? (node.getAttribute('aria-label') === wanted || (node.textContent ?? '').trim() === wanted) : text(node).startsWith(wanted) || (node.textContent ?? '').trim().startsWith(wanted));
    if (target === undefined) return false;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return true;
  })()`);

/** Height of the first element matching a selector, or of a button by label. */
const heightOf = (app, selector) =>
  app.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return node ? node.getBoundingClientRect().height : null; })()`);
const buttonHeight = (app, label) =>
  app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.getAttribute('aria-label') ?? (candidate.textContent ?? '')).trim() === ${JSON.stringify(label)});
    return node ? node.getBoundingClientRect().height : null;
  })()`);

/** Scroll the innermost element whose text contains `text` into view (for the screenshot). */
const reveal = (app, text) =>
  app.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = Array.from(document.querySelectorAll('div, span')).filter((node) => (node.textContent ?? '').includes(wanted));
    const node = nodes.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    if (node) node.scrollIntoView({ block: 'center' });
    return node !== undefined;
  })()`);

async function shot(app, name) {
  await app.screenshot(name);
  evidence.screenshots.push(`docs/images/p5b/${name}.png`);
}

mkdirSync(join(ROOT, "docs/images/p5b"), { recursive: true });
const app = await boot({ fresh: true, port: PORT, cdpPort: 9487, windowSize: VIEWPORT });

try {
  await app.step("new Germany campaign");
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
  await app.typeText("German");
  await sleep(700);
  await app.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'));
    const matches = nodes.filter((node) => (node.textContent ?? '').trim().startsWith('German Empire'));
    const match = matches.sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0];
    if (match) { match.scrollIntoView({ block: 'center' }); match.click(); }
  })()`);
  await sleep(1200);
  await app.clickAria("Play as German", { exact: false });
  await waitForText(app, "TREASURY", 240_000);
  await sleep(3000);

  await app.step("run two days");
  await app.clickAria("Play");
  await waitForText(app, "3 Jan 1900", 240_000);
  await app.clickAria("Pause");
  await sleep(1500);

  await app.step("Markets screen");
  await press(app, "Economy");
  await sleep(800);
  await press(app, "Markets");
  let body = await waitForText(app, "goods traded", 30_000);
  check("home market counts the goods traded of 60", /\d+ of 60 goods traded/.test(body), body.match(/\d+ of 60 goods traded/)?.[0] ?? null);
  const searchHeight = await heightOf(app, 'input[aria-label="Search goods"]');
  check("goods search field is at least 44 pt", searchHeight !== null && searchHeight >= 44, String(searchHeight));
  const chipHeight = await buttonHeight(app, "Capital and transport equipment");
  check("group chips offered, at least 44 pt", chipHeight !== null && chipHeight >= 44, String(chipHeight));
  check("goods grouped under the catalogue headings", body.includes("Food and agriculture ·") && body.includes("Services ·"), null);
  await press(app, "Mining ·", false);
  await sleep(800);
  body = await app.text();
  check("goods not traded here are folded and counted", /\d+ not traded here/.test(body), body.match(/\d+ not traded here/)?.[0] ?? null);
  await reveal(app, "not traded here");
  await sleep(400);
  await shot(app, "p5b-844x390-markets");
  await app.focus('input[aria-label="Search goods"]');
  await app.typeText("steel");
  await sleep(1200);
  body = await app.text();
  check("search finds steel with its price per t", /Steel[\s\S]{0,80}per t/.test(body), null);
  await reveal(app, "per t ·");
  await sleep(400);
  await shot(app, "p5b-844x390-markets-search");
  await app.evaluate(`(() => { const input = document.querySelector('input[aria-label="Search goods"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(800);
  const opened = await press(app, "United States", false);
  check("another market can be opened", opened === true, null);
  await sleep(4000);
  body = await app.text();
  check("its prices arrive with the next snapshot (no loading line left)", !body.includes("Loading prices for this market"), null);
  await shot(app, "p5b-844x390-markets-focus");

  await app.step("Country screen production");
  await press(app, "Realm");
  await sleep(600);
  await press(app, "Overview");
  await sleep(1200);
  await press(app, "Production capacity by good", false);
  await sleep(1200);
  body = await app.text();
  check("production capacity is grouped and searchable", body.includes("made") && (await heightOf(app, 'input[aria-label="Search production by good"]')) !== null, null);
  await reveal(app, "estimated capacity");
  await sleep(400);
  await shot(app, "p5b-844x390-production");

  await app.step("Construction screen");
  await press(app, "Economy");
  await sleep(600);
  await press(app, "Construction");
  await sleep(1200);
  await press(app, "Choose a public project", false);
  await sleep(1000);
  body = await app.text();
  check("project types grouped by sector", body.includes("Mining ·") && body.includes("Manufacturing ·"), null);
  await press(app, "Manufacturing ·", false);
  await sleep(800);
  body = await app.text();
  check("a locked project type names its technology", /needs [A-Z]/.test(body), body.match(/[A-Za-z ]+ · needs [A-Za-z ]+/)?.[0] ?? null);
  await reveal(app, "· needs ");
  await sleep(400);
  await shot(app, "p5b-844x390-construction");
  // C-12: a hydro station shows the target province's river flow (or why there is none).
  await press(app, "Energy ·", false);
  await sleep(800);
  await press(app, "Hydroelectric Station", false);
  await sleep(2500);
  body = await app.text();
  const hydroNote = body.match(/River flow for hydro stations:[^)]*\)\.|No hydro potential in this province[^:]*: [^.]*\.|The province's river flow appears here[^.]*\./)?.[0] ?? null;
  check("a hydro station shows the province's river flow", hydroNote !== null, hydroNote);
  await reveal(app, hydroNote === null ? "Hydroelectric Station" : hydroNote.slice(0, 20));
  await sleep(400);
  await shot(app, "p5b-844x390-construction-hydro");

  await app.step("Money screen");
  await press(app, "Money");
  body = await waitForText(app, "Standard", 30_000);
  check("Money screen shows the gold standard and the mint's metal", body.includes("gold ·") && body.includes("Mint's metal"), null);
  check("currency change control offered", body.includes("Adopt another currency"), null);
  await reveal(app, "Mint's metal");
  await sleep(400);
  await shot(app, "p5b-844x390-money");

  const small = await app.evaluate(`(() => Array.from(document.querySelectorAll('[role="button"]')).filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((node) => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)).slice(0, 10))()`);
  check("every visible button on the Money screen is at least 44 pt", small.length === 0, JSON.stringify(small));

  // P6 (D-153): the Households section and the Crowding lens.
  await app.step("Population screen households");
  await press(app, "Society");
  await sleep(600);
  await press(app, "Population");
  body = await waitForText(app, "Households", 30_000);
  check("Households section shows the food share and saving", body.includes("Food share") && body.includes("Saving rate"), null);
  check("Households section shows housing per dwelling and crowding", /per dwelling/.test(body) && body.includes("crowding"), body.match(/[0-9.]+ per dwelling/)?.[0] ?? null);
  await reveal(app, "Food share");
  await sleep(400);
  await shot(app, "p6-844x390-households");
  await press(app, "Close sheet", false);
  await sleep(800);

  await app.step("crowding lens");
  const lensSwitch = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[aria-label]')).find((candidate) => (candidate.getAttribute('aria-label') ?? '').startsWith('Map lens'));
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height };
  })()`);
  check("lens switch is at least 44 pt", lensSwitch !== null && lensSwitch.height >= 44, JSON.stringify(lensSwitch));
  await sleep(800);
  const crowdingChip = await app.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('[role="button"]')).find((candidate) => (candidate.textContent ?? '').trim() === 'Crowding');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    node.click();
    return { height: box.height };
  })()`);
  check("Crowding lens offered, at least 44 pt", crowdingChip !== null && crowdingChip.height >= 44, JSON.stringify(crowdingChip));
  await sleep(1500);
  body = await app.text();
  check("crowding legend shows the bands", body.includes("Below 90%") && body.includes("125% and above"), null);
  await shot(app, "p6-844x390-crowding-lens");

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
  writeJson(join(ROOT, "docs/images/p5b/playtest-goods.json"), evidence);
  await app.close();
}
console.log(`${String(evidence.checks.filter((entry) => entry.passed).length)}/${String(evidence.checks.length)} checks passed; ${String(evidence.errors.length)} errors`);
process.exit(evidence.errors.length === 0 ? 0 : 1);
